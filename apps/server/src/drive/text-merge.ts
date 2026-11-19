export type TextMergeResult = { status: 'merged'; text: string } | { status: 'conflict' };

interface Hunk {
    start: number;
    end: number;
    lines: readonly number[];
}

const diffCostCap = 1000;

export function mergeText(base: string, head: string, incoming: string) {
    if (head === incoming || base === incoming) {
        return { status: 'merged', text: head } satisfies TextMergeResult;
    }
    if (base === head) {
        return { status: 'merged', text: incoming } satisfies TextMergeResult;
    }
    const ids = new Map<string, number>();
    const intern = (text: string) =>
        text.split('\n').map((line) => {
            const known = ids.get(line);
            if (known !== undefined) {
                return known;
            }
            ids.set(line, ids.size);
            return ids.size - 1;
        });
    const baseLines = intern(base);
    const merged = mergeLines(
        baseLines,
        diffLines(baseLines, intern(head)),
        diffLines(baseLines, intern(incoming))
    );
    if (!merged) {
        return { status: 'conflict' } satisfies TextMergeResult;
    }
    const lines = [...ids.keys()];
    return {
        status: 'merged',
        text: merged.map((id) => lines[id]).join('\n'),
    } satisfies TextMergeResult;
}

function mergeLines(base: readonly number[], ours: Hunk[], theirs: Hunk[]) {
    const hunks = [
        ...ours.map((hunk) => ({ ...hunk, side: 0 })),
        ...theirs.map((hunk) => ({ ...hunk, side: 1 })),
    ].sort((left, right) => left.start - right.start || left.end - right.end);
    const output: number[] = [];
    let cursor = 0;
    let index = 0;
    while (index < hunks.length) {
        const first = hunks[index];
        if (!first) {
            break;
        }
        const group = [first];
        let end = first.end;
        index += 1;
        for (let next = hunks[index]; next && next.start <= end; next = hunks[index]) {
            group.push(next);
            end = Math.max(end, next.end);
            index += 1;
        }
        const start = first.start;
        const sides = [0, 1].flatMap((side) => {
            const own = group.filter((hunk) => hunk.side === side);
            return own.length ? [applyHunks(base, start, end, own)] : [];
        });
        const [chosen, other] = sides;
        if (!chosen || (other && !sameLines(chosen, other))) {
            return null;
        }
        output.push(...base.slice(cursor, start), ...chosen);
        cursor = end;
    }
    output.push(...base.slice(cursor));
    return output;
}

function applyHunks(base: readonly number[], start: number, end: number, hunks: Hunk[]) {
    const lines: number[] = [];
    let cursor = start;
    for (const hunk of hunks) {
        lines.push(...base.slice(cursor, hunk.start), ...hunk.lines);
        cursor = hunk.end;
    }
    lines.push(...base.slice(cursor, end));
    return lines;
}

function sameLines(left: readonly number[], right: readonly number[]) {
    return left.length === right.length && left.every((line, index) => line === right[index]);
}

function diffLines(a: readonly number[], b: readonly number[]) {
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
        prefix += 1;
    }
    let suffix = 0;
    while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) {
        suffix += 1;
    }
    const left = a.slice(prefix, a.length - suffix);
    const right = b.slice(prefix, b.length - suffix);
    if (left.length === 0 && right.length === 0) {
        return [];
    }
    const edits = shortestEdit(left, right);
    if (!edits) {
        return [{ end: prefix + left.length, lines: right, start: prefix }];
    }
    return hunksOf(edits, left.length, right.length, right).map((hunk) => ({
        ...hunk,
        end: hunk.end + prefix,
        start: hunk.start + prefix,
    }));
}

function shortestEdit(a: readonly number[], b: readonly number[]) {
    const n = a.length;
    const m = b.length;
    const max = Math.min(n + m, diffCostCap);
    const offset = max + 1;
    const frontier = new Int32Array(2 * max + 3);
    const trace: Int32Array[] = [];
    for (let d = 0; d <= max; d += 1) {
        for (let k = -d; k <= d; k += 2) {
            const down =
                k === -d ||
                (k !== d && (frontier[offset + k - 1] ?? 0) < (frontier[offset + k + 1] ?? 0));
            let x = down ? (frontier[offset + k + 1] ?? 0) : (frontier[offset + k - 1] ?? 0) + 1;
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x += 1;
                y += 1;
            }
            frontier[offset + k] = x;
            if (x >= n && y >= m) {
                trace.push(frontier);
                return backtrack(trace, n, m);
            }
        }
        trace.push(frontier.slice(offset - d - 1, offset + d + 2));
    }
    return null;
}

function backtrack(trace: Int32Array[], n: number, m: number) {
    const deleted = new Uint8Array(n);
    const inserted = new Uint8Array(m);
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d > 0; d -= 1) {
        const previous = trace[d - 1];
        if (!previous) {
            break;
        }
        const at = (k: number) => previous[k + d] ?? 0;
        const k = x - y;
        const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
        const priorK = down ? k + 1 : k - 1;
        const priorX = at(priorK);
        const priorY = priorX - priorK;
        if (down) {
            inserted[priorY] = 1;
        } else {
            deleted[priorX] = 1;
        }
        x = priorX;
        y = priorY;
    }
    return { deleted, inserted };
}

function hunksOf(
    edits: { deleted: Uint8Array; inserted: Uint8Array },
    n: number,
    m: number,
    b: readonly number[]
) {
    const hunks: Hunk[] = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && !edits.deleted[i] && !edits.inserted[j]) {
            i += 1;
            j += 1;
            continue;
        }
        const start = i;
        const from = j;
        while ((i < n && edits.deleted[i]) || (j < m && edits.inserted[j])) {
            if (i < n && edits.deleted[i]) {
                i += 1;
            } else {
                j += 1;
            }
        }
        hunks.push({ end: i, lines: b.slice(from, j), start });
    }
    return hunks;
}
