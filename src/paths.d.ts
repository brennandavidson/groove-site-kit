export type PageKind = "campaign" | "site";
export type SiteMode = "campaign" | "full";

export declare const LEGAL_PATHS: Readonly<{ privacy: "/privacy"; terms: "/terms"; smsOptIn: "/sms-opt-in" }>;
export declare function normalizePath(pathname: string): string;
export declare function slugFromPath(pathname: string): string;
export declare function isExcludedPath(pathname: string): boolean;
export declare function pageKind(pathname: string, mode?: SiteMode): PageKind;
