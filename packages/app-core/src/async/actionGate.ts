/** A scope is a session identity/epoch, not a reusable account ID. */
export function createScopedActionGate<Scope>(currentScope: () => Scope | null | undefined) {
  let held: { scope: Scope } | undefined;
  return {
    acquire(scope: Scope) {
      if (scope == null || currentScope() !== scope || held?.scope === scope) return undefined;
      const lease = { scope };
      held = lease;
      return {
        current: () => held === lease && currentScope() === scope,
        release() { if (held === lease) held = undefined; },
      };
    },
  };
}
