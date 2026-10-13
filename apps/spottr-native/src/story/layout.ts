export function wrapStoryText(value: string, limit: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/)) {
    if (line && Array.from(line + ' ' + word).length > limit) { lines.push(line); line = ''; }
    let remaining = Array.from(word);
    while (remaining.length > limit) {
      if (line) { lines.push(line); line = ''; }
      lines.push(remaining.slice(0, limit).join('')); remaining = remaining.slice(limit);
    }
    line += (line ? ' ' : '') + remaining.join('');
  }
  if (line) lines.push(line);
  return lines;
}
export const STORY_TITLE_HEIGHT = 500;
export const STORY_TITLE_LEADING = 0.96;

export function storyTitle(value: string) {
  const text = value.trim().toUpperCase();
  const longestWord = Math.max(0, ...text.split(/\s+/).map(word => Array.from(word).length));
  for (let size = 246; size >= 16; size -= 2) {
    const limit = Math.floor(916 / (size * 0.59));
    // Keep ordinary event names intact; split only exceptionally long tokens.
    if (longestWord <= 28 && longestWord > limit) continue;
    const lines = wrapStoryText(text, limit);
    if (lines.length * size * STORY_TITLE_LEADING <= STORY_TITLE_HEIGHT) return { size, lines };
  }
  const lines = wrapStoryText(text, 96);
  return { size: Math.min(16, STORY_TITLE_HEIGHT / Math.max(1, lines.length) / STORY_TITLE_LEADING), lines };
}

export function storyDate(value: string, language: 'ro' | 'en') {
  if (!Number.isFinite(Date.parse(value))) return { date: '—', time: '—' };
  const locale = language === 'ro' ? 'ro-RO' : 'en-GB', timeZone = 'Europe/Bucharest';
  return {
    date: new Intl.DateTimeFormat(locale, { timeZone, day: '2-digit', month: 'short' }).format(new Date(value)).replace(/\./g, '').toUpperCase(),
    time: new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)),
  };
}

export function storyLocation(value: string) {
  for (let size = 38; size >= 20; size -= 2) {
    const lines = wrapStoryText(value, Math.floor(900 / (size * 0.68)));
    if (lines.length <= 2) return { size, lines };
  }
  const lines = wrapStoryText(value, 66);
  return { size: 20, lines: lines.length > 2 ? [lines[0]!, lines[1]!.slice(0, 65) + '…'] : lines };
}
