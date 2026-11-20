import { diffLines, type Hunk } from './text-diff.ts';

export type TextMergeResult = { status: 'merged'; text: string } | { status: 'conflict' };

export function mergeText(base: string, head: string, incoming: string) {
    if (head === incoming || base === incoming) {
        return { status: 'merged', text: head } satisfies TextMergeResult;
    }
    if (base === head) {
        return { status: 'merged', text: incoming } satisfies TextMergeResult;
    }
    const ids = new Map<string, number>();
    const intern = (text: string) =>
        Int32Array.from(splitLines(text), (line) => internLine(ids, line));
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
        text: merged.map((id) => lines[id]).join(''),
    } satisfies TextMergeResult;
}

function splitLines(text: string) {
    const lines: string[] = [];
    let start = 0;
    while (start < text.length) {
        const newline = text.indexOf('\n', start);
        const end = newline === -1 ? text.length : newline + 1;
        lines.push(text.slice(start, end));
        start = end;
    }
    return lines;
}

function internLine(ids: Map<string, number>, line: string) {
    const known = ids.get(line);
    if (known !== undefined) {
        return known;
    }
    ids.set(line, ids.size);
    return ids.size - 1;
}

function mergeLines(base: Int32Array, ours: Hunk[], theirs: Hunk[]) {
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
        append(output, base.subarray(cursor, start));
        append(output, chosen);
        cursor = end;
    }
    append(output, base.subarray(cursor));
    return output;
}

function applyHunks(base: Int32Array, start: number, end: number, hunks: Hunk[]) {
    const lines: number[] = [];
    let cursor = start;
    for (const hunk of hunks) {
        append(lines, base.subarray(cursor, hunk.start));
        append(lines, hunk.lines);
        cursor = hunk.end;
    }
    append(lines, base.subarray(cursor, end));
    return lines;
}

function append(target: number[], source: Iterable<number>) {
    for (const line of source) {
        target.push(line);
    }
}

function sameLines(left: readonly number[], right: readonly number[]) {
    return left.length === right.length && left.every((line, index) => line === right[index]);
}
