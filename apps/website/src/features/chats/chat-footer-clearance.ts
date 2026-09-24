/**
 * The height the transcript clears under its floating footer: from the highest
 * composer surface — the footer itself, or the stack (typing row, reply bar)
 * that rises out of it — down to the footer's bottom edge.
 */
export function chatFooterClearance(input: {
    footerBottom: number;
    footerTop: number;
    stackTop?: number | undefined;
}): number {
    const top =
        input.stackTop === undefined ? input.footerTop : Math.min(input.footerTop, input.stackTop);

    return Math.max(0, Math.ceil(input.footerBottom - top));
}
