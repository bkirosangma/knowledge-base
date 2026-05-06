import { headerSlug } from "./headerSlug";

export interface HeaderInfo {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

const ATX_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE_RE = /^```/;

export function extractHeaders(markdown: string): HeaderInfo[] {
  const out: HeaderInfo[] = [];
  let inFence = false;
  for (const lineRaw of markdown.split(/\r?\n/)) {
    if (FENCE_RE.test(lineRaw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (lineRaw.startsWith("    ") || lineRaw.startsWith("\t")) continue; // indented code
    const m = ATX_RE.exec(lineRaw);
    if (!m) continue;
    const level = m[1].length as HeaderInfo["level"];
    const text = m[2].trim();
    out.push({ id: headerSlug(text), text, level });
  }
  return out;
}
