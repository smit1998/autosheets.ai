// "Idle time" = seconds since the user's last keyboard / mouse / trackpad
// input. macOS publishes this on the HID system object; we read it via
// `ioreg` — no native bindings needed.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// `-c IOHIDSystem -r -d 1` filters to that single class and depth-limits the
// output so we don't have to parse the whole IO registry on every poll.
const IOREG_ARGS = ['-c', 'IOHIDSystem', '-r', '-d', '1'];
const HID_IDLE_PATTERN = /"HIDIdleTime"\s*=\s*(\d+)/;

// Returns seconds since last input. Null on platforms we don't support yet
// or if the probe fails — callers should treat null as "can't tell, assume
// the user is present" rather than guessing.
export async function getIdleSeconds(): Promise<number | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileP('ioreg', IOREG_ARGS, { timeout: 2000 });
    const m = HID_IDLE_PATTERN.exec(stdout);
    if (!m) return null;
    const ns = Number(m[1]);
    if (!Number.isFinite(ns) || ns < 0) return null;
    return ns / 1_000_000_000;
  } catch {
    return null;
  }
}
