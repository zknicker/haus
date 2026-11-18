/** The universal-newline set every reader of Agent inbox text must agree on: `\r\n`, then `\n`, `\r`, VT, FF, FS, GS, RS, NEL, LINE SEPARATOR, and PARAGRAPH SEPARATOR. */
export const universalLineBreak = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85  ]/gu;
