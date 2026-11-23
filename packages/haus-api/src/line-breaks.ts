/**
 * The universal-newline set every reader of Agent inbox text must agree on:
 * `\r\n`, then LF, CR, VT, FF, FS, GS, RS, NEL, LINE SEPARATOR, and PARAGRAPH
 * SEPARATOR. Each call returns a fresh global regex, so no caller shares
 * `lastIndex` state with another.
 */
export function createLineBreakPattern() {
    return /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/gu;
}
