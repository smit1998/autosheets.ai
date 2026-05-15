import type {
  ClassifyInput,
  ClassifyResult,
  LLMClient,
  LLMProbe,
} from './types';

export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
// Qwen 2.5 7B Instruct — small enough to run as a background agent on a
// typical laptop. Bigger models (qwen3 / qwen3.6) give better category
// matching but are slower per run and need a lot more RAM.
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';

type OllamaConfig = {
  host?: string;
  model?: string;
};

// Ollama exposes /api/generate (single-turn) and /api/chat (multi-turn). We
// use generate with format=json so the model returns parseable JSON without
// needing to invent a chat schema.
export class OllamaClient implements LLMClient {
  private readonly host: string;
  private readonly model: string;

  constructor(config: OllamaConfig = {}) {
    this.host = (config.host ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, '');
    this.model = config.model ?? DEFAULT_OLLAMA_MODEL;
  }

  async probe(): Promise<LLMProbe> {
    try {
      const res = await fetch(`${this.host}/api/tags`, { method: 'GET' });
      if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };
      const body = (await res.json()) as { models?: { name: string }[] };
      const installed = body.models?.map((m) => m.name) ?? [];
      const hasModel = installed.some((n) => n === this.model || n.startsWith(`${this.model}:`));
      if (!hasModel) {
        return {
          ok: false,
          error: `Model "${this.model}" is not installed. Run: ollama pull ${this.model}`,
        };
      }
      return { ok: true, model: this.model };
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
      const detail =
        cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : 'unknown error');
      return { ok: false, error: `Cannot reach Ollama at ${this.host}: ${detail}` };
    }
  }

  async classify(input: ClassifyInput): Promise<ClassifyResult[]> {
    if (input.observations.length === 0) return [];
    if (input.options.length === 0) {
      return input.observations.map((o) => ({
        index: o.index,
        projectId: null,
        categoryId: null,
        confidence: 0,
        reasoning: 'No projects available to assign.',
      }));
    }

    const prompt = buildPrompt(input);
    // Stream the response. A non-streamed /api/generate keeps the HTTP
    // connection idle for the full generation time (can be 30–90s on a 7B
    // model), which trips Node/undici's default body/headers timeout and
    // surfaces as a useless "TypeError: fetch failed". Streaming sends a
    // chunk per token, so the socket is never idle long enough to abort.
    let res: Response;
    try {
      res = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: true,
          format: 'json',
          options: { temperature: 0.1 },
        }),
      });
    } catch (e) {
      throw wrapFetchError(e, `${this.host}/api/generate`);
    }
    if (!res.ok) {
      throw new Error(`Ollama /api/generate returned ${res.status}: ${await res.text()}`);
    }
    if (!res.body) {
      throw new Error('Ollama /api/generate returned an empty body.');
    }

    let combined = '';
    const decoder = new TextDecoder();
    let buf = '';
    try {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line) continue;
          try {
            const chunk = JSON.parse(line) as { response?: string; done?: boolean; error?: string };
            if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
            if (typeof chunk.response === 'string') combined += chunk.response;
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('Ollama: ')) throw e;
            // Ignore non-JSON keep-alive lines if any.
          }
        }
      }
    } catch (e) {
      throw wrapFetchError(e, `${this.host}/api/generate (streaming)`);
    }

    // Surface the prompt + raw response while we tune. Cheap at our volume;
    // we'll trim or gate behind a debug flag once classification is solid.
    console.log('[llm] observations sent:', JSON.stringify(input.observations));
    console.log('[llm] raw response:', combined);
    return parseResponse(combined, input);
  }
}

// Node's fetch (undici) reports a generic "TypeError: fetch failed" and tucks
// the actual reason (ECONNREFUSED, UND_ERR_HEADERS_TIMEOUT, ENOTFOUND) under
// .cause. Surface it so the renderer / logs aren't useless.
function wrapFetchError(e: unknown, where: string): Error {
  if (!(e instanceof Error)) return new Error(`fetch failed at ${where}`);
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message ?? e.message;
  return new Error(`Cannot reach ${where}: ${detail}`);
}

// Address projects + categories by small 1-based integers — a 7B model
// echoes ints reliably; UUIDs and decimal-notation labels (e.g. "1.1") it
// mangles. categoryIndex is *per project* (resets to 1 inside each project).
function buildPrompt(input: ClassifyInput): string {
  const optionsLines: string[] = [];
  input.options.forEach((p, pi) => {
    optionsLines.push(`Project ${pi + 1} ("${p.projectName}"):`);
    if (p.categories.length === 0) {
      optionsLines.push(`  (no categories defined)`);
    } else {
      p.categories.forEach((c, ci) => {
        optionsLines.push(`  Category ${ci + 1}: ${c.name}`);
      });
    }
  });

  const observationLines = input.observations.map((o) => {
    const fields = [
      `app=${JSON.stringify(o.app ?? '')}`,
      `windowTitle=${JSON.stringify(o.windowTitle ?? '')}`,
    ];
    if (o.url) fields.push(`url=${JSON.stringify(o.url)}`);
    fields.push(`durationSec=${o.durationSeconds}`);
    return `  Observation ${o.index}: ${fields.join(', ')}`;
  });

  return [
    'You are a timesheet classification assistant.',
    '',
    'For each observation, pick the best matching project and category from the numbered options below. If no option is a clearly good fit, set projectIndex and categoryIndex to 0 — do not guess.',
    '',
    'Available options (categoryIndex is numbered within each project, starting at 1):',
    ...optionsLines,
    '',
    'Observations:',
    ...observationLines,
    '',
    'Respond ONLY with JSON of this exact shape:',
    '{ "results": [ { "obsIndex": <integer>, "projectIndex": <integer 0 or 1+>, "categoryIndex": <integer 0 or 1+>, "confidence": <number between 0 and 1>, "reasoning": "<short string>" } ] }',
    '',
    'Rules:',
    '- projectIndex and categoryIndex MUST be plain integers (e.g. 1, 2, 3). Never use decimals like 1.1.',
    '- categoryIndex is the 1-based position within the chosen project (or 0 if projectIndex is 0).',
    '- Include exactly one entry per observation, preserving order.',
    '- Use confidence < 0.5 for guesses.',
    '- Match window titles to category names by intent (e.g. a YouTube tab → a "Youtube" category if available).',
  ].join('\n');
}

type RawResult = {
  obsIndex?: number;
  projectIndex?: number;
  categoryIndex?: number;
  confidence?: number;
  reasoning?: string;
};

function parseResponse(text: string, input: ClassifyInput): ClassifyResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }
  const root = parsed as { results?: unknown };
  if (!root || !Array.isArray(root.results)) {
    throw new Error(`LLM response missing "results" array.`);
  }

  const out: ClassifyResult[] = [];
  for (const raw of root.results as unknown[]) {
    const r = raw as RawResult;
    if (typeof r.obsIndex !== 'number') continue;

    // Coerce to integer — Qwen sometimes returns decimals like 1.1 (it
    // treats my "Category 1.1" labels as numbers). Out-of-range values
    // fall through to a clean "no fit" rather than crashing on undefined.
    const projectIdx = sanitizeIndex(r.projectIndex);
    const categoryIdx = sanitizeIndex(r.categoryIndex);
    const confidence =
      typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1
        ? r.confidence
        : 0;
    const reasoning = typeof r.reasoning === 'string' ? r.reasoning : undefined;

    let projectId: string | null = null;
    let categoryId: string | null = null;
    if (projectIdx >= 1 && projectIdx <= input.options.length) {
      const project = input.options[projectIdx - 1];
      if (project) {
        projectId = project.projectId;
        if (categoryIdx >= 1 && categoryIdx <= project.categories.length) {
          const cat = project.categories[categoryIdx - 1];
          if (cat) categoryId = cat.id;
        }
      }
    }
    // A project with no chosen category isn't useful for time tracking — drop
    // both so the caller doesn't need to special-case it.
    if (projectId && !categoryId) {
      projectId = null;
    }

    out.push({
      index: r.obsIndex,
      projectId,
      categoryId,
      confidence,
      reasoning,
    });
  }
  return out;
}

function sanitizeIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  // Floor down: a returned 1.1 is intent "category 1", not category 2.
  const floored = Math.floor(value);
  return floored >= 0 ? floored : 0;
}
