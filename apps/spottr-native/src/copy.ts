import { resources } from "../../pulse-app/src/i18n/resources";
import type { Language } from "./i18n";

// Reuse the exact product copy; no separate native wording to drift over time.
export function productCopy(
  language: Language,
  key: string,
  values: Record<string, string | number> = {},
) {
  const dictionary = resources[language].translation;
  const lookup = (path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (value, part) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[part]
            : undefined,
        dictionary,
      );
  const count = values.count;
  const suffix = count === 0 ? "_zero" : count === 1 ? "_one" : "_other";
  const value =
    (typeof count === "number" ? lookup(key + suffix) : undefined) ??
    (typeof count === "number" ? lookup(key + "_other") : undefined) ??
    lookup(key);
  return typeof value === "string"
    ? value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ""))
    : key;
}
