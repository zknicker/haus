/** The universal-newline set every reader of Agent inbox text must agree on: `\r\n`, then `\n`, `\r`, VT, FF, FS, GS, RS, NEL, LINE SEPARATOR, and PARAGRAPH SEPARATOR. */
const universalLineBreakSource = '\\r\\n|[\\n\\r\\v\\f\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]';

/**
 * A fresh global regex on every call. `.split`/`.replace` never mutate
 * `lastIndex`, but a shared `RegExp` object is still one piece of state a
 * later `.test`/`.exec` elsewhere could leak into — returning a new instance
 * each call makes that impossible.
 */
export function createLineBreakPattern(): RegExp {
    return new RegExp(universalLineBreakSource, 'gu');
}
