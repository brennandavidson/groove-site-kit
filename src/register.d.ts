import type { PageKind, SiteMode } from "./paths.js";

export type RegisteredPage = { slug: string; title: string; path: string; kind: PageKind };

export declare function titleFromHtml(html: string): string;

export declare function collectPages(input: {
  pages: { pathname: string }[];
  dir: URL | string;
  mode?: SiteMode;
  warn?: (msg: string) => void;
}): Promise<RegisteredPage[]>;

export declare function registerPages(input: {
  portalUrl: string;
  clientSlug: string;
  token: string;
  siteUrl: string;
  pages: RegisteredPage[];
  fetch?: typeof fetch;
}): Promise<{ registered: number }>;
