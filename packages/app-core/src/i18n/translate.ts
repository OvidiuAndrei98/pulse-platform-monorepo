import { resources } from './resources';

export type Copy = (key: string, values?: Record<string, string | number>) => string;
export function translate(language: 'ro' | 'en', key: string, values: Record<string, string | number> = {}): string {
  const lookup = (path: string) => path.split('.').reduce<unknown>((current, part) =>
    current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined,
    resources[language].translation);
  const suffix = values.count === 0 ? '_zero' : values.count === 1 ? '_one' : '_other';
  const value = (typeof values.count === 'number' ? lookup(key + suffix) ?? lookup(key + '_other') : undefined) ?? lookup(key);
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? '')) : key;
}
