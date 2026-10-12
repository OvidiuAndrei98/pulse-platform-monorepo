// Hosted web checkout has its own return flow. Never persist Stripe payment
// capabilities in browser storage as a substitute for native SecureStore.
export {};
