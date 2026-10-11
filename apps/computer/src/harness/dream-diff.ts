/**
 * Line diffs for a dream's memory record: Myers' O(ND) diff and git-style
 * unified hunks whose headers name the enclosing `## ` section, the way git's
 * function context does, so a reader can tell which part of MEMORY.md changed.
 */

export interface DiffOp {
    readonly kind: ' ' | '-' | '+';
    readonly text: string;
}

/** Past this many edits a file reads as fully replaced rather than spending time on a minimal diff. */
const maxEdits = 2000;
const contextLines = 3;

export function splitLines(text: string): string[] {
    if (text === '') {
        return [];
    }
    const lines = text.split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }
    return lines;
}

/** The edit script turning `before` into `after`, common prefix and suffix trimmed first. */
export function diffLines(before: readonly string[], after: readonly string[]): DiffOp[] {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
        start += 1;
    }
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
        endBefore -= 1;
        endAfter -= 1;
    }
    const middleBefore = before.slice(start, endBefore);
    const middleAfter = after.slice(start, endAfter);
    const middle = myers(middleBefore, middleAfter) ?? [
        ...middleBefore.map((text) => op('-', text)),
        ...middleAfter.map((text) => op('+', text)),
    ];
    return [
        ...before.slice(0, start).map((text) => op(' ', text)),
        ...middle,
        ...before.slice(endBefore).map((text) => op(' ', text)),
    ];
}

export function countOps(ops: readonly DiffOp[]): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const entry of ops) {
        if (entry.kind === '+') {
            added += 1;
        } else if (entry.kind === '-') {
            removed += 1;
        }
    }
    return { added, removed };
}

/** Unified hunks with three lines of context, each header naming its `## ` section. */
export function formatHunks(
    ops: readonly DiffOp[],
    before: readonly string[],
    after: readonly string[]
): string[] {
    const rows: Array<DiffOp & { newIndex: number; oldIndex: number }> = [];
    let oldIndex = 0;
    let newIndex = 0;
    for (const entry of ops) {
        rows.push({ ...entry, newIndex, oldIndex });
        if (entry.kind !== '+') {
            oldIndex += 1;
        }
        if (entry.kind !== '-') {
            newIndex += 1;
        }
    }
    const changed = rows.flatMap((row, index) => (row.kind === ' ' ? [] : [index]));
    const lines: string[] = [];
    let cursor = 0;
    while (cursor < changed.length) {
        let last = changed[cursor] ?? 0;
        const first = Math.max(0, last - contextLines);
        while (
            cursor + 1 < changed.length &&
            (changed[cursor + 1] ?? 0) - last - 1 <= 2 * contextLines
        ) {
            cursor += 1;
            last = changed[cursor] ?? last;
        }
        const hunk = rows.slice(first, Math.min(rows.length, last + contextLines + 1));
        const head = hunk[0];
        if (head) {
            const oldCount = hunk.filter((row) => row.kind !== '+').length;
            const newCount = hunk.filter((row) => row.kind !== '-').length;
            const section =
                before.length > 0
                    ? sectionBefore(before, head.oldIndex)
                    : sectionBefore(after, head.newIndex);
            lines.push(
                `@@ -${rangeOf(head.oldIndex, oldCount)} +${rangeOf(head.newIndex, newCount)} @@${section ? ` ${section}` : ''}`,
                ...hunk.map((row) => `${row.kind}${row.text}`)
            );
        }
        cursor += 1;
    }
    return lines;
}

function rangeOf(index: number, count: number): string {
    // Unified diff names the line before an empty range.
    return `${count === 0 ? index : index + 1},${count}`;
}

/** The nearest `## ` heading above line `index`, which is what the hunk sits inside. */
function sectionBefore(lines: readonly string[], index: number): string | null {
    for (let line = Math.min(index, lines.length) - 1; line >= 0; line -= 1) {
        const text = lines[line] ?? '';
        if (text.startsWith('## ')) {
            return text.trim();
        }
    }
    return null;
}

/** Myers' greedy diff; null when the files differ by more than `maxEdits` lines. */
function myers(before: readonly string[], after: readonly string[]): DiffOp[] | null {
    const n = before.length;
    const m = after.length;
    if (n === 0 || m === 0) {
        return [...before.map((text) => op('-', text)), ...after.map((text) => op('+', text))];
    }
    const max = Math.min(n + m, maxEdits);
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    const at = (k: number) => v[offset + k] ?? 0;
    const trace: Int32Array[] = [];
    for (let d = 0; d <= max; d += 1) {
        for (let k = -d; k <= d; k += 2) {
            const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
            let x = down ? at(k + 1) : at(k - 1) + 1;
            let y = x - k;
            while (x < n && y < m && before[x] === after[y]) {
                x += 1;
                y += 1;
            }
            v[offset + k] = x;
            if (x >= n && y >= m) {
                trace.push(v.slice(offset - d, offset + d + 1));
                return backtrack(trace, before, after);
            }
        }
        trace.push(v.slice(offset - d, offset + d + 1));
    }
    return null;
}

function backtrack(
    trace: readonly Int32Array[],
    before: readonly string[],
    after: readonly string[]
): DiffOp[] {
    const ops: DiffOp[] = [];
    let x = before.length;
    let y = after.length;
    for (let d = trace.length - 1; d > 0; d -= 1) {
        const previous = trace[d - 1] as Int32Array;
        const at = (k: number) => previous[k + d - 1] ?? 0;
        const k = x - y;
        const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
        const previousK = down ? k + 1 : k - 1;
        const previousX = at(previousK);
        const previousY = previousX - previousK;
        while (x > previousX && y > previousY) {
            ops.push(op(' ', before[x - 1] ?? ''));
            x -= 1;
            y -= 1;
        }
        if (down) {
            ops.push(op('+', after[y - 1] ?? ''));
            y -= 1;
        } else {
            ops.push(op('-', before[x - 1] ?? ''));
            x -= 1;
        }
    }
    while (x > 0 && y > 0) {
        ops.push(op(' ', before[x - 1] ?? ''));
        x -= 1;
        y -= 1;
    }
    return ops.reverse();
}

function op(kind: DiffOp['kind'], text: string): DiffOp {
    return { kind, text };
}
