import type { components } from '@packages/api-client/schema';

export type FeedEvent = components['schemas']['EventFeedItem'];
export type FeedPage = components['schemas']['EventFeedPage'];
export type LikeResult = components['schemas']['EventLikeResponse'];
export type FeedRequest = (path: string, method: 'GET' | 'PUT' | 'DELETE', signal: AbortSignal) => Promise<unknown>;
export type FeedState = {
  items: FeedEvent[]; pending: boolean; loadingMore: boolean; nextPage?: number;
  error: boolean; likeErrors: readonly string[]; working: readonly string[];
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function parseLike(value: unknown): LikeResult {
  if (!record(value) || !Number.isSafeInteger(value.likeCount) || (value.likeCount as number) < 0 || typeof value.liked !== 'boolean') throw new Error('INVALID_RESPONSE');
  return value as LikeResult;
}
export function parseFeedPage(value: unknown, page: number): FeedPage {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 10 ||
    value.nextPage !== undefined && (value.nextPage !== page + 1 || page >= 500)) throw new Error('INVALID_RESPONSE');
  const seen = new Set<string>();
  for (const event of value.items) {
    if (!record(event) || !id(event.id) || !id(event.organizerId) || seen.has(String(event.id)) ||
      !['title','category','city','locationName','description','startTime','endTime'].every(key => typeof event[key] === 'string') ||
      !Number.isFinite(Date.parse(String(event.startTime))) || !Number.isFinite(Date.parse(String(event.endTime))) ||
      typeof event.externalTickets !== 'boolean' || event.bannerUrl !== undefined && typeof event.bannerUrl !== 'string' ||
      event.priceRon !== undefined && (typeof event.priceRon !== 'number' || !Number.isFinite(event.priceRon) || event.priceRon < 0)) throw new Error('INVALID_RESPONSE');
    parseLike(event); seen.add(String(event.id));
  }
  return value as FeedPage;
}
/** Read only public fields; caller owns authentication and account lifetime. */
export class EventFeedStore {
  private state: FeedState = {items: [], pending: true, loadingMore: false, error: false, likeErrors: [], working: []};
  private listeners = new Set<() => void>();
  private read?: AbortController;
  private writes = new Map<string, AbortController>();
  private versions = new Map<string, number>();
  private disposed = false;
  private loaded = false;
  constructor(private request: FeedRequest, private current: () => boolean) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private active = () => !this.disposed && this.current();
  private publish(patch: Partial<FeedState>) {
    if (!this.active()) return;
    this.state = {...this.state, ...patch}; this.listeners.forEach(listener => listener());
  }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; this.read?.abort(); this.read = undefined; this.writes.forEach(write => write.abort()); this.writes.clear(); }
  async load(more = false) {
    if (!this.active() || this.read || more && !this.state.nextPage) return;
    const page = more ? this.state.nextPage! : 1, read = this.read = new AbortController(), versions = new Map(this.versions);
    this.publish({pending: !this.loaded, loadingMore: more, error: false});
    try {
      const result = parseFeedPage(await this.request('/event-feed?page=' + page, 'GET', read.signal), page);
      if (!this.active() || this.read !== read || read.signal.aborted) return;
      const rows = result.items.map(item => {
        const current = this.state.items.find(row => row.id === item.id);
        // A read started before a like cannot undo that completed mutation.
        return current && (this.writes.has(item.id) || versions.get(item.id) !== this.versions.get(item.id)) ? {...item, liked: current.liked, likeCount: current.likeCount} : item;
      });
      const items = more ? [...this.state.items, ...rows.filter(item => !this.state.items.some(row => row.id === item.id))] : rows;
      this.loaded = true; this.publish({items, nextPage: result.nextPage});
    } catch { if (!read.signal.aborted && this.read === read) this.publish({error: true}); }
    finally { if (this.read === read) { this.read = undefined; this.publish({pending: false, loadingMore: false}); } }
  }
  async setLike(eventId: string, liked: boolean) {
    if (!this.active() || this.writes.has(eventId)) return;
    const before = this.state.items.find(item => item.id === eventId);
    if (!before || before.liked === liked) return;
    const write = new AbortController(); this.writes.set(eventId, write);
    this.versions.set(eventId, (this.versions.get(eventId) ?? 0) + 1);
    this.publish({working: [...this.writes.keys()], likeErrors: this.state.likeErrors.filter(id => id !== eventId),
      items: this.state.items.map(item => item.id === eventId ? {...item, liked, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1))} : item)});
    try {
      const result = parseLike(await this.request('/events/' + eventId + '/likes', liked ? 'PUT' : 'DELETE', write.signal));
      if (!this.active() || this.writes.get(eventId) !== write || write.signal.aborted) return;
      this.publish({items: this.state.items.map(item => item.id === eventId ? {...item, ...result} : item)});
    } catch {
      if (this.active() && !write.signal.aborted && this.writes.get(eventId) === write) this.publish({
        items: this.state.items.map(item => item.id === eventId ? {...item, liked: before.liked, likeCount: before.likeCount} : item),
        likeErrors: [...this.state.likeErrors, eventId],
      });
    } finally {
      if (this.writes.get(eventId) === write) { this.writes.delete(eventId); this.publish({working: [...this.writes.keys()]}); }
    }
  }
}

export function feedDate(event: Pick<FeedEvent, 'startTime'>, language: string) {
  return new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', {timeZone: 'Europe/Bucharest', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(event.startTime));
}
export function feedMoney(price: number, language: string) {
  return new Intl.NumberFormat(language === 'ro' ? 'ro-RO' : 'en-GB', {style: 'currency', currency: 'RON', maximumFractionDigits: 2}).format(price);
}
