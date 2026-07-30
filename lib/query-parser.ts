import type { FacetType, FilterClause } from "./types";

export interface ParsedQuery {
  text: string;
  filters: FilterClause[];
}

const TOKEN_PATTERNS: { regex: RegExp; type: FacetType; extract: (m: RegExpExecArray) => string }[] = [
  { regex: /#(\S+)/g, type: "category" as FacetType, extract: (m) => m[1] },
  { regex: /@(\S+)/g, type: "author" as FacetType, extract: (m) => m[1] },
  { regex: /!domain:(\S+)/gi, type: "domain" as FacetType, extract: (m) => m[1] },
  { regex: /!folder:(\S+)/gi, type: "folder" as FacetType, extract: (m) => m[1] },
  { regex: /site:(\S+)/gi, type: "linkedDomain" as FacetType, extract: (m) => m[1] },
  { regex: /media:(\S+)/gi, type: "media" as FacetType, extract: (m) => m[1] },
];

export function parseQuery(input: string): ParsedQuery {
  const filters: FilterClause[] = [];
  let text = input;

  for (const pattern of TOKEN_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      matches.push(pattern.extract(m));
    }
    for (const val of matches) {
      filters.push({ type: pattern.type, value: val });
    }
    text = text.replace(pattern.regex, "").trim();
  }

  return { text, filters };
}

export function formatFilterLabel(clause: FilterClause): string {
  const prefixMap: Record<FacetType, string> = {
    all: "",
    category: "#",
    author: "@",
    domain: "!domain:",
    folder: "!folder:",
    linkedDomain: "site:",
    media: "media:",
  };
  return `${prefixMap[clause.type]}${clause.value}`;
}

export function getFilterTypeLabel(type: FacetType): string {
  const labels: Record<FacetType, string> = {
    all: "All",
    category: "Category",
    domain: "Domain",
    folder: "Folder",
    author: "Author",
    linkedDomain: "Linked Site",
    media: "Media",
  };
  return labels[type];
}
