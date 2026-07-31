export interface QuoteRange {
  start: number;
  end: number;
  /** False when only a leading fragment of the quote matched. */
  exact: boolean;
}

/**
 * Locate a model-supplied quote inside the resume the user actually submitted.
 * Whitespace is normalized because the model reflows line breaks, and the match
 * degrades to a leading-word prefix so a truncated quote still points somewhere.
 * A null result is meaningful: the quote is not in the source text, which means
 * the finding resting on it is unverified.
 */
export function findQuoteRange(
  haystack: string,
  quote: string
): QuoteRange | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return null;
  }

  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const floor = Math.min(4, words.length);

  for (let count = words.length; count >= floor; count -= 1) {
    const pattern = new RegExp(words.slice(0, count).map(escape).join("\\s+"), "i");
    const match = pattern.exec(haystack);

    if (match) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        exact: count === words.length
      };
    }
  }

  return null;
}
