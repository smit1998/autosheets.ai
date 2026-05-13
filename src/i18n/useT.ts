import en from './en.json';

type Dict = typeof en;

// Resolve dot-paths like "dashboard.title" against the JSON dictionary.
type PathOf<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends Record<string, unknown>
    ? `${K}.${PathOf<T[K]>}`
    : K
  : never;

export type TKey = PathOf<Dict>;

function resolve(path: string): string {
  const parts = path.split('.');
  let node: unknown = en;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof node === 'string' ? node : path;
}

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function t(key: TKey, params?: Record<string, string | number>): string {
  return format(resolve(key), params);
}

export function useT() {
  return t;
}
