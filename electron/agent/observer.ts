// Polls the OS for the foreground window and emits "segments" — runs of
// consecutive samples with the same (app, title). Each ended segment is
// written to the observations table.
//
// On macOS, active-win ships an ESM JS wrapper around a Swift CLI binary.
// Importing the JS wrapper inside our CJS Electron main eagerly loads its
// Windows/Linux .node bindings (`Module did not self-register` failures),
// so we shell out to the Swift binary directly. It prints JSON on stdout
// when the user has granted Accessibility, and an error string on stderr
// when not.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { app } from 'electron';
import { insertObservation } from '../repositories/observations';

const execFileP = promisify(execFile);

type Sample = {
  app: string | null;
  windowTitle: string | null;
  url: string | null;
  at: Date;
};

type Segment = {
  app: string | null;
  windowTitle: string | null;
  url: string | null;
  startedAt: Date;
  lastSeenAt: Date;
};

type ObserverConfig = {
  userId: string;
  // Poll interval in milliseconds. 20s keeps the foreground sampler cheap
  // and is plenty fine-grained for time tracking.
  intervalMs?: number;
  // Minimum segment length to persist. Drops quick alt-tabs as noise.
  minDurationSeconds?: number;
  onError?: (err: unknown) => void;
};

// Resolve once and cache. In dev the binary lives in node_modules. In a
// packaged app it gets copied alongside the main bundle (electron-builder
// `extraFiles`); we'll wire that when we ship.
function resolveActiveWinBinary(): string {
  // app.getAppPath() points at the project root in dev (/.../autosheets) and
  // at the asar in packaged builds. Either way node_modules sits alongside.
  return path.join(app.getAppPath(), 'node_modules', 'active-win', 'main');
}

async function querySwiftBinary(binary: string): Promise<{
  app: string | null;
  title: string | null;
  url: string | null;
}> {
  // The binary returns either a JSON object on stdout or an explanatory
  // error on stderr (e.g. "active-win requires the accessibility permission
  // …"). execFile resolves only on exit code 0, so the permission case lands
  // in `catch` with stderr attached.
  try {
    const { stdout } = await execFileP(binary, [], {
      timeout: 4000,
      // Don't inherit our env; the binary is self-contained.
      env: process.env,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return { app: null, title: null, url: null };
    const parsed = JSON.parse(trimmed) as {
      title?: string | null;
      owner?: { name?: string | null };
      url?: string | null;
    };
    return {
      app: parsed.owner?.name ?? null,
      title: parsed.title ?? null,
      url: parsed.url ?? null,
    };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const stderr = (err.stderr ?? '').trim();
    if (stderr) {
      // Surface the binary's own message — usually clearer than the wrapper.
      throw new Error(stderr);
    }
    throw new Error(err.message ?? String(e));
  }
}

export class Observer {
  private readonly userId: string;
  private readonly intervalMs: number;
  private readonly minDurationSeconds: number;
  private readonly onError: (err: unknown) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private active: Segment | null = null;
  private lastObservationAt: Date | null = null;
  private lastError: string | null = null;
  private binaryPath: string | null = null;

  constructor(cfg: ObserverConfig) {
    this.userId = cfg.userId;
    this.intervalMs = cfg.intervalMs ?? 20_000;
    this.minDurationSeconds = cfg.minDurationSeconds ?? 5;
    this.onError = cfg.onError ?? (() => {});
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  getLastObservationAt(): Date | null {
    return this.lastObservationAt;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flushActive(new Date());
  }

  // Persist whatever segment is in-flight without stopping the loop. Used
  // by "Classify now" so the classifier can see the user's current activity.
  flushPending(): void {
    this.flushActive(new Date());
  }

  private async tick(): Promise<void> {
    try {
      const sample = await this.sample();
      const now = sample.at;
      if (!sameWindow(this.active, sample)) {
        this.flushActive(now);
        this.active = {
          app: sample.app,
          windowTitle: sample.windowTitle,
          url: sample.url,
          startedAt: now,
          lastSeenAt: now,
        };
      } else if (this.active) {
        this.active.lastSeenAt = now;
      }
      this.lastObservationAt = now;
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.onError(e);
    }
  }

  private async sample(): Promise<Sample> {
    if (!this.binaryPath) this.binaryPath = resolveActiveWinBinary();
    const win = await querySwiftBinary(this.binaryPath);
    return {
      app: win.app,
      windowTitle: win.title,
      url: win.url,
      at: new Date(),
    };
  }

  private flushActive(now: Date): void {
    const seg = this.active;
    if (!seg) return;
    const durationMs = seg.lastSeenAt.getTime() - seg.startedAt.getTime();
    const durationSec = durationMs / 1000;
    if (durationSec >= this.minDurationSeconds) {
      try {
        insertObservation({
          userId: this.userId,
          startedAt: seg.startedAt.toISOString(),
          endedAt: now.toISOString(),
          app: seg.app,
          windowTitle: seg.windowTitle,
          url: seg.url,
        });
      } catch (e) {
        this.onError(e);
      }
    }
    this.active = null;
  }
}

function sameWindow(active: Segment | null, sample: Sample): boolean {
  if (!active) return false;
  return active.app === sample.app && active.windowTitle === sample.windowTitle;
}
