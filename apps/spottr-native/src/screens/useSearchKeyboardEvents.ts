export type SearchKeyboardEvent = { progress: number; height: number; duration: number; target: number };
export type SearchKeyboardHandlers = Partial<Record<'onStart' | 'onMove' | 'onEnd' | 'onInteractive', (event: SearchKeyboardEvent) => void>>;
export type SearchKeyboardVisibilityHandlers = { onWillHide: () => void; onDidHide: () => void; onDidShow: () => void };
// Web uses the same interruptible spring without a native keyboard timeline.
export function useSearchKeyboardEvents(_handlers: SearchKeyboardHandlers, _visibility?: SearchKeyboardVisibilityHandlers) {}
