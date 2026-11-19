export function mergeLines(
    base: Uint8Array | undefined,
    head: Uint8Array | undefined,
    ours: Uint8Array
) {
    if (!(base && head)) {
        return null;
    }
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes).split('\n');
    const [baseLines, headLines, ourLines] = [decode(base), decode(head), decode(ours)];
    if (baseLines.length !== headLines.length || baseLines.length !== ourLines.length) {
        return null;
    }
    const merged: string[] = [];
    for (const [index, line] of baseLines.entries()) {
        const theirs = headLines[index];
        const mine = ourLines[index];
        if (mine === line || mine === theirs) {
            merged.push(theirs);
        } else if (theirs === line) {
            merged.push(mine);
        } else {
            return null;
        }
    }
    return new TextEncoder().encode(merged.join('\n'));
}
