import { bogoSqrt, compareRecords } from './text-diff-myers.ts';

export interface Hunk {
    start: number;
    end: number;
    lines: Int32Array;
}

const maxEqualLimit = 1024;
const scanWindow = 100;
const keepDiscardRun = 4;

export function diffLines(a: Int32Array, b: Int32Array) {
    const changedA = new Uint8Array(a.length);
    const changedB = new Uint8Array(b.length);
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
        start += 1;
    }
    let suffix = 0;
    while (
        suffix < a.length - start &&
        suffix < b.length - start &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) {
        suffix += 1;
    }
    const keptA = keepRecords(a, b, start, a.length - suffix, changedA);
    const keptB = keepRecords(b, a, start, b.length - suffix, changedB);
    compareRecords(keptA, keptB, changedA, changedB);
    compact(a, changedA, changedB);
    compact(b, changedB, changedA);
    return hunksOf(changedA, changedB, b);
}

function keepRecords(
    own: Int32Array,
    other: Int32Array,
    start: number,
    end: number,
    changed: Uint8Array
) {
    const counts = new Map<number, number>();
    for (const id of other) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const limit = Math.min(bogoSqrt(own.length), maxEqualLimit);
    const kinds = new Uint8Array(end - start);
    for (let at = start; at < end; at += 1) {
        const matches = counts.get(own[at]) ?? 0;
        kinds[at - start] = matches === 0 ? 0 : matches >= limit ? 2 : 1;
    }
    const index: number[] = [];
    for (let at = 0; at < kinds.length; at += 1) {
        if (kinds[at] === 1 || (kinds[at] === 2 && !discardsMultimatch(kinds, at))) {
            index.push(start + at);
        } else {
            changed[start + at] = 1;
        }
    }
    return { ids: Int32Array.from(index, (at) => own[at]), index: Int32Array.from(index) };
}

function discardsMultimatch(kinds: Uint8Array, at: number) {
    const first = Math.max(0, at - scanWindow);
    const last = Math.min(kinds.length - 1, at + scanWindow);
    let unmatchedBefore = 0;
    let multiBefore = 1;
    for (let step = at - 1; step >= first && kinds[step] !== 1; step -= 1) {
        if (kinds[step] === 0) {
            unmatchedBefore += 1;
        } else {
            multiBefore += 1;
        }
    }
    if (unmatchedBefore === 0) {
        return false;
    }
    let unmatchedAfter = 0;
    let multiAfter = 1;
    for (let step = at + 1; step <= last && kinds[step] !== 1; step += 1) {
        if (kinds[step] === 0) {
            unmatchedAfter += 1;
        } else {
            multiAfter += 1;
        }
    }
    if (unmatchedAfter === 0) {
        return false;
    }
    const multi = multiBefore + multiAfter;
    return multi * keepDiscardRun < multi + unmatchedBefore + unmatchedAfter;
}

function compact(lines: Int32Array, changed: Uint8Array, other: Uint8Array) {
    const group = { end: 0, start: 0 };
    const otherGroup = { end: 0, start: 0 };
    groupInit(changed, group);
    groupInit(other, otherGroup);
    for (;;) {
        if (group.end !== group.start) {
            let size: number;
            let earliestEnd: number;
            let matchingEnd = -1;
            do {
                size = group.end - group.start;
                matchingEnd = -1;
                while (slideUp(lines, changed, group)) {
                    groupPrevious(other, otherGroup);
                }
                earliestEnd = group.end;
                if (otherGroup.end > otherGroup.start) {
                    matchingEnd = group.end;
                }
                while (slideDown(lines, changed, group)) {
                    groupNext(other, otherGroup);
                    if (otherGroup.end > otherGroup.start) {
                        matchingEnd = group.end;
                    }
                }
            } while (size !== group.end - group.start);
            if (group.end !== earliestEnd && matchingEnd !== -1) {
                while (otherGroup.end === otherGroup.start) {
                    slideUp(lines, changed, group);
                    groupPrevious(other, otherGroup);
                }
            }
        }
        if (!groupNext(changed, group)) {
            return;
        }
        groupNext(other, otherGroup);
    }
}

interface Group {
    end: number;
    start: number;
}

function groupInit(changed: Uint8Array, group: Group) {
    group.start = 0;
    group.end = 0;
    while (changed[group.end]) {
        group.end += 1;
    }
}

function groupNext(changed: Uint8Array, group: Group) {
    if (group.end === changed.length) {
        return false;
    }
    group.start = group.end + 1;
    group.end = group.start;
    while (changed[group.end]) {
        group.end += 1;
    }
    return true;
}

function groupPrevious(changed: Uint8Array, group: Group) {
    if (group.start === 0) {
        return false;
    }
    group.end = group.start - 1;
    group.start = group.end;
    while (changed[group.start - 1]) {
        group.start -= 1;
    }
    return true;
}

function slideDown(lines: Int32Array, changed: Uint8Array, group: Group) {
    if (group.end >= lines.length || lines[group.start] !== lines[group.end]) {
        return false;
    }
    changed[group.start] = 0;
    group.start += 1;
    changed[group.end] = 1;
    group.end += 1;
    while (changed[group.end]) {
        group.end += 1;
    }
    return true;
}

function slideUp(lines: Int32Array, changed: Uint8Array, group: Group) {
    if (group.start <= 0 || lines[group.start - 1] !== lines[group.end - 1]) {
        return false;
    }
    group.start -= 1;
    changed[group.start] = 1;
    group.end -= 1;
    changed[group.end] = 0;
    while (changed[group.start - 1]) {
        group.start -= 1;
    }
    return true;
}

function hunksOf(changedA: Uint8Array, changedB: Uint8Array, b: Int32Array) {
    const hunks: Hunk[] = [];
    let i = 0;
    let j = 0;
    while (i < changedA.length || j < changedB.length) {
        if (!(changedA[i] || changedB[j])) {
            i += 1;
            j += 1;
            continue;
        }
        const start = i;
        const from = j;
        while (changedA[i]) {
            i += 1;
        }
        while (changedB[j]) {
            j += 1;
        }
        hunks.push({ end: i, lines: b.subarray(from, j), start });
    }
    return hunks;
}
