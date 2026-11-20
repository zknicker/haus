export interface Split {
    a: number;
    b: number;
    minimalLow: boolean;
    minimalHigh: boolean;
}

export interface Frontiers {
    backward: Int32Array;
    cost: number;
    forward: Int32Array;
    offset: number;
}

export interface Box {
    bmax: number;
    bmid: number;
    bmin: number;
    fmax: number;
    fmid: number;
    fmin: number;
    lim1: number;
    lim2: number;
    off1: number;
    off2: number;
}

export const snakeLength = 20;
export const lineMax = 0x3f_ff_ff_ff;
const heuristicFactor = 4;

export function sampleSnakes(
    ha1: Int32Array,
    ha2: Int32Array,
    { backward: kvdb, forward: kvdf, offset: o }: Frontiers,
    { bmax, bmid, bmin, fmax, fmid, fmin, lim1, lim2, off1, off2 }: Box,
    ec: number
) {
    let best = 0;
    let found: Split | null = null;
    for (let d = fmax; d >= fmin; d -= 2) {
        const i1 = kvdf[o + d];
        const i2 = i1 - d;
        const v = i1 - off1 + (i2 - off2) - Math.abs(d - fmid);
        if (
            v > heuristicFactor * ec &&
            v > best &&
            off1 + snakeLength <= i1 &&
            i1 < lim1 &&
            off2 + snakeLength <= i2 &&
            i2 < lim2 &&
            snakeEndsAt(ha1, ha2, i1, i2)
        ) {
            best = v;
            found = { a: i1, b: i2, minimalHigh: false, minimalLow: true };
        }
    }
    if (found) {
        return found;
    }
    for (let d = bmax; d >= bmin; d -= 2) {
        const i1 = kvdb[o + d];
        const i2 = i1 - d;
        const v = lim1 - i1 + (lim2 - i2) - Math.abs(d - bmid);
        if (
            v > heuristicFactor * ec &&
            v > best &&
            off1 < i1 &&
            i1 <= lim1 - snakeLength &&
            off2 < i2 &&
            i2 <= lim2 - snakeLength &&
            snakeStartsAt(ha1, ha2, i1, i2)
        ) {
            best = v;
            found = { a: i1, b: i2, minimalHigh: true, minimalLow: false };
        }
    }
    return found;
}

export function furthestReach(
    { backward: kvdb, forward: kvdf, offset: o }: Frontiers,
    { bmax, bmin, fmax, fmin, lim1, lim2, off1, off2 }: Box
) {
    let fbest = -1;
    let fbest1 = -1;
    for (let d = fmax; d >= fmin; d -= 2) {
        let i1 = Math.min(kvdf[o + d], lim1);
        let i2 = i1 - d;
        if (lim2 < i2) {
            i1 = lim2 + d;
            i2 = lim2;
        }
        if (fbest < i1 + i2) {
            fbest = i1 + i2;
            fbest1 = i1;
        }
    }
    let bbest = lineMax;
    let bbest1 = lineMax;
    for (let d = bmax; d >= bmin; d -= 2) {
        let i1 = Math.max(off1, kvdb[o + d]);
        let i2 = i1 - d;
        if (i2 < off2) {
            i1 = off2 + d;
            i2 = off2;
        }
        if (i1 + i2 < bbest) {
            bbest = i1 + i2;
            bbest1 = i1;
        }
    }
    if (lim1 + lim2 - bbest < fbest - (off1 + off2)) {
        return {
            a: fbest1,
            b: fbest - fbest1,
            minimalHigh: false,
            minimalLow: true,
        } satisfies Split;
    }
    return { a: bbest1, b: bbest - bbest1, minimalHigh: true, minimalLow: false } satisfies Split;
}

function snakeEndsAt(ha1: Int32Array, ha2: Int32Array, i1: number, i2: number) {
    for (let k = 1; ha1[i1 - k] === ha2[i2 - k]; k += 1) {
        if (k === snakeLength) {
            return true;
        }
    }
    return false;
}

function snakeStartsAt(ha1: Int32Array, ha2: Int32Array, i1: number, i2: number) {
    for (let k = 0; ha1[i1 + k] === ha2[i2 + k]; k += 1) {
        if (k === snakeLength - 1) {
            return true;
        }
    }
    return false;
}
