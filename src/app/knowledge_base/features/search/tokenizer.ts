// Vault search tokenizer (KB-010 / SEARCH-1.1).
//
// Produces a canonical lowercased token stream from arbitrary text. The
// regex captures runs of unicode word characters and digits, which is
// strong enough to skip Markdown punctuation (`*`, `_`, `[`, `]`, etc.)
// without bespoke stripping. Tokens shorter than 2 characters are dropped
// — a length-1 prefix match would saturate the index for any vault with
// more than a handful of files.

export interface TokenWithPosition {
  /** Lowercased token. */
  token: string;
  /** Character offset of the token in the source string. Used for snippet
   *  generation around the first match. */
  position: number;
}

const WORD_RE = /[\p{L}\p{N}]+/gu;
const MIN_TOKEN_LENGTH = 2;

/** Plain token stream — no positions. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenizeWithPositions(text)) out.push(t.token);
  return out;
}

/** Token stream with character offsets into the original `text`. */
export function tokenizeWithPositions(text: string): TokenWithPosition[] {
  const result: TokenWithPosition[] = [];
  WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(text)) !== null) {
    const token = match[0].toLowerCase();
    if (token.length >= MIN_TOKEN_LENGTH) {
      result.push({ token, position: match.index });
    }
  }
  return result;
}
