import type { components } from './schema';

/** Response contracts without importing the browser transport implementation. */
type Simplify<T> = T extends object ? { [Key in keyof T]: T[Key] } : T;
export type ReadableSchema<Name extends keyof components['schemas']> = Simplify<components['schemas'][Name]>;
