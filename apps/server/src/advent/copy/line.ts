import type { AdventLineRun } from '@haus/api';

/** A strong run: the numbers and names the App sets in bold. */
export interface StrongPart {
    strong: string;
}

export type LinePart = string | StrongPart;

/** One innkeeper line: hand-written text around counted values. */
export type Line = readonly AdventLineRun[];

export function b(value: string | number): StrongPart {
    return { strong: String(value) };
}

/** Joins parts into runs, merging neighbours of the same weight and dropping empty text. */
export function line(...parts: LinePart[]): Line {
    const runs: AdventLineRun[] = [];
    for (const part of parts) {
        const run =
            typeof part === 'string'
                ? { strong: false, text: part }
                : { strong: true, text: part.strong };
        if (run.text.length === 0) {
            continue;
        }
        const previous = runs.at(-1);
        if (previous && previous.strong === run.strong) {
            runs[runs.length - 1] = { strong: run.strong, text: previous.text + run.text };
        } else {
            runs.push(run);
        }
    }
    return runs;
}

/**
 * A stable choice among hand-written variants for one member, year and door,
 * so a reload never rewrites a door the member already opened.
 */
export function pickVariant<T>(variants: readonly T[], seed: string): T {
    const variant = variants[fnv1a(seed) % variants.length];
    if (variant === undefined) {
        throw new Error('An advent fact needs at least one line.');
    }
    return variant;
}

export function variantSeed(userId: string, year: number, day: number): string {
    return `${userId}:${year}:${day}`;
}

/** 32-bit FNV-1a: tiny, stable across runtimes, and well spread for short keys. */
function fnv1a(text: string): number {
    let hash = 0x81_1c_9d_c5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01_00_01_93);
    }
    return hash >>> 0;
}
