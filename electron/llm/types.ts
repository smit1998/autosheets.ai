// Shape of input/output for the classification call. Stays decoupled from
// any specific LLM so we can swap providers (Ollama, Anthropic, OpenAI)
// behind the same interface.

export type ClassifyObservation = {
  // Stable index the LLM echoes back in its response.
  index: number;
  app: string | null;
  windowTitle: string | null;
  url: string | null;
  durationSeconds: number;
};

export type ClassifyOption = {
  projectId: string;
  projectName: string;
  categories: { id: string; name: string }[];
};

export type ClassifyInput = {
  observations: ClassifyObservation[];
  options: ClassifyOption[];
};

export type ClassifyResult = {
  index: number;
  projectId: string | null;
  categoryId: string | null;
  // 0..1 — model's confidence that the assignment is correct.
  confidence: number;
  reasoning?: string;
};

export type LLMProbe =
  | { ok: true; model: string }
  | { ok: false; error: string };

export interface LLMClient {
  probe(): Promise<LLMProbe>;
  classify(input: ClassifyInput): Promise<ClassifyResult[]>;
}
