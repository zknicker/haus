/**
 * Keeps a bare number sentence such as "42." or "144)" literal.
 *
 * CommonMark reads a block that is only `<digits>.` as an ordered list whose
 * single item is empty, so a one-word answer renders as `<ol start="42"><li>`:
 * the text becomes an uncopyable list marker hung outside the reply column,
 * over the author's avatar. A chat reply never means an empty list item, so a
 * marker line that opens a block is escaped back to text. Lines inside fenced
 * code, and markers that continue a list (no blank line before them), keep
 * their Markdown meaning.
 */
export function escapeBareOrderedMarkers(content: string): string {
    const lines = content.split('\n');
    let fence: null | string = null;

    return lines
        .map((line, index) => {
            const opensFence = fenceMarker(line);

            if (opensFence) {
                fence = fence === opensFence ? null : (fence ?? opensFence);
                return line;
            }

            const previous = index === 0 ? '' : (lines[index - 1] ?? '');

            if (fence || previous.trim().length > 0) {
                return line;
            }

            return line.replace(bareOrderedMarkerPattern, '$1\\$2');
        })
        .join('\n');
}

const bareOrderedMarkerPattern = /^( {0,3}\d{1,9})([.)])[ \t]*\r?$/u;

function fenceMarker(line: string) {
    return /^[ \t]{0,3}(`{3,}|~{3,})/u.exec(line)?.[1]?.[0] ?? null;
}
