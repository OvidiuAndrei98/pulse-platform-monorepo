import { translate } from '@packages/app-core/i18n/translate';
import type { Language } from './i18n';

// All product wording, including wardrobe, comes from the shared i18n resources.
export function productCopy(language: Language, key: string, values: Record<string,string|number> = {}) {
  return translate(language,key,values);
}
