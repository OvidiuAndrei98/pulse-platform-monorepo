export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
  links?: Array<{ label: string; href: string }>;
};
