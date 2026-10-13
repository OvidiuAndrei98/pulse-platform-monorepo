export const RECENT_SEARCH_LIMIT = 5;
export const cleanSearch = (value: string) => Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, 120).join('');
export function rememberSearch(items: string[], value: string): string[] {
  const query = cleanSearch(value);
  if (!query) return items;
  return [query, ...items.filter(item => item.toLocaleLowerCase() !== query.toLocaleLowerCase())].slice(0, RECENT_SEARCH_LIMIT);
}
export function parseRecentSearches(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string').reverse().reduce(rememberSearch, []);
  } catch { return []; }
}
