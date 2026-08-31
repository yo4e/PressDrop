export type JsonScalar = string | number | boolean | null;

export interface SourceIdentity {
  adapter: "markdown";
  sourceId: string;
  filename: string;
  fingerprint: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

export interface HeadingBlock {
  type: "heading";
  level: 2 | 3;
  text: string;
}

export interface ImageBlock {
  type: "image";
  mediaRef: string;
  alt: string;
  caption: string;
  credit: string;
}

export type ArticleBlock = ParagraphBlock | HeadingBlock | ImageBlock;

export interface MediaItem {
  ref: string;
  path: string;
  role: "featured" | "inline" | "featured-and-inline";
}

export interface NormalizedArticle {
  schemaVersion: 1;
  source: SourceIdentity;
  title: string;
  excerpt?: string;
  blocks: ArticleBlock[];
  media: MediaItem[];
  categories: string[];
  tags: string[];
  meta: Record<string, JsonScalar>;
  featuredMediaRef?: string;
}

export interface PipelineResult {
  article: NormalizedArticle;
  warnings: string[];
}
