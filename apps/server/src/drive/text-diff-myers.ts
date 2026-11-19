import {
    type Box,
    type Frontiers,
    furthestReach,
    lineMax,
    type Split,
    sampleSnakes,
    snakeLength,
} from './text-diff-cutoffs.ts';

export interface KeptRecords {
    ids: Int32Array;
    index: Int32Array;
}

const minCost = 256;
const heuristicCost = 256;

export function compareRecords(
    left: KeptRecords,
    right: KeptRecords,
    changedLeft: Uint8Array,
    changedRight: Uint8Array
) {
    const a = left.ids;
    const b = right.ids;
    const size = a.length + b.length + 3;
    const frontiers = {
        backward: new Int32Array(size),
        cost: Math.max(minCost, bogoSqrt(size)),
        forward: new Int32Array(size),
        offset: b.length + 1,
    } satisfies Frontiers;
    const stack = [{ aHi: a.length, aLo: 0, bHi: b.length, bLo: 0, minimal: false }];
    for (let box = stack.pop(); box; box = stack.pop()) {
        let { aLo, aHi, bLo, bHi } = box;
        while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
            aLo += 1;
            bLo += 1;
        }
        while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) {
            aHi -= 1;
            bHi -= 1;
        }
        if (aLo === aHi) {
            markRange(changedRight, right.index, bLo, bHi);
        } else if (bLo === bHi) {
            markRange(changedLeft, left.index, aLo, aHi);
        } else {
            const split = middleSnake(a, aLo, aHi, b, bLo, bHi, frontiers, box.minimal);
            stack.push(
                { aHi: split.a, aLo, bHi: split.b, bLo, minimal: split.minimalLow },
                { aHi, aLo: split.a, bHi, bLo: split.b, minimal: split.minimalHigh }
            );
        }
    }
}

export function bogoSqrt(value: number) {
    let root = 1;
    for (let rest = value; rest > 0; rest = Math.floor(rest / 4)) {
        root *= 2;
    }
    return root;
}

function middleSnake(
    ha1: Int32Array,
    off1: number,
    lim1: number,
    ha2: Int32Array,
    off2: number,
    lim2: number,
    frontiers: Frontiers,
    minimal: boolean
) {
    const fmid = off1 - off2;
    const bmid = lim1 - lim2;
    const search = {
        box: { bmax: bmid, bmid, bmin: bmid, fmax: fmid, fmid, fmin: fmid, lim1, lim2, off1, off2 },
        dmax: lim1 - off2,
        dmin: off1 - lim2,
        frontiers,
        ha1,
        ha2,
        odd: ((fmid - bmid) & 1) !== 0,
    } satisfies Search;
    frontiers.forward[frontiers.offset + fmid] = off1;
    frontiers.backward[frontiers.offset + bmid] = lim1;
    for (let ec = 1; ; ec += 1) {
        const forward = forwardPass(search);
        if (forward.split) {
            return forward.split;
        }
        const backward = backwardPass(search);
        if (backward.split) {
            return backward.split;
        }
        if (minimal) {
            continue;
        }
        const sampled =
            (forward.gotSnake || backward.gotSnake) && ec > heuristicCost
                ? sampleSnakes(ha1, ha2, frontiers, search.box, ec)
                : null;
        if (sampled) {
            return sampled;
        }
        if (ec >= frontiers.cost) {
            return furthestReach(frontiers, search.box);
        }
    }
}

interface Search {
    box: Box;
    dmax: number;
    dmin: number;
    frontiers: Frontiers;
    ha1: Int32Array;
    ha2: Int32Array;
    odd: boolean;
}

function forwardPass({ box, dmax, dmin, frontiers, ha1, ha2, odd }: Search) {
    const { backward: kvdb, forward: kvdf, offset: o } = frontiers;
    [box.fmin, box.fmax] = widen(kvdf, o, box.fmin, box.fmax, dmin, dmax, -1);
    let gotSnake = false;
    for (let d = box.fmax; d >= box.fmin; d -= 2) {
        let i1 = kvdf[o + d - 1] >= kvdf[o + d + 1] ? kvdf[o + d - 1] + 1 : kvdf[o + d + 1];
        const start = i1;
        let i2 = i1 - d;
        while (i1 < box.lim1 && i2 < box.lim2 && ha1[i1] === ha2[i2]) {
            i1 += 1;
            i2 += 1;
        }
        gotSnake ||= i1 - start > snakeLength;
        kvdf[o + d] = i1;
        if (odd && box.bmin <= d && d <= box.bmax && kvdb[o + d] <= i1) {
            return { gotSnake, split: exactSplit(i1, i2) };
        }
    }
    return { gotSnake, split: null };
}

function backwardPass({ box, dmax, dmin, frontiers, ha1, ha2, odd }: Search) {
    const { backward: kvdb, forward: kvdf, offset: o } = frontiers;
    [box.bmin, box.bmax] = widen(kvdb, o, box.bmin, box.bmax, dmin, dmax, lineMax);
    let gotSnake = false;
    for (let d = box.bmax; d >= box.bmin; d -= 2) {
        let i1 = kvdb[o + d - 1] < kvdb[o + d + 1] ? kvdb[o + d - 1] : kvdb[o + d + 1] - 1;
        const start = i1;
        let i2 = i1 - d;
        while (i1 > box.off1 && i2 > box.off2 && ha1[i1 - 1] === ha2[i2 - 1]) {
            i1 -= 1;
            i2 -= 1;
        }
        gotSnake ||= start - i1 > snakeLength;
        kvdb[o + d] = i1;
        if (!odd && box.fmin <= d && d <= box.fmax && i1 <= kvdf[o + d]) {
            return { gotSnake, split: exactSplit(i1, i2) };
        }
    }
    return { gotSnake, split: null };
}

function widen(
    frontier: Int32Array,
    offset: number,
    low: number,
    high: number,
    dmin: number,
    dmax: number,
    sentinel: number
) {
    let min = low;
    let max = high;
    if (min > dmin) {
        min -= 1;
        frontier[offset + min - 1] = sentinel;
    } else {
        min += 1;
    }
    if (max < dmax) {
        max += 1;
        frontier[offset + max + 1] = sentinel;
    } else {
        max -= 1;
    }
    return [min, max] as const;
}

function exactSplit(a: number, b: number) {
    return { a, b, minimalHigh: true, minimalLow: true } satisfies Split;
}

function markRange(changed: Uint8Array, index: Int32Array, from: number, to: number) {
    for (let at = from; at < to; at += 1) {
        changed[index[at]] = 1;
    }
}
