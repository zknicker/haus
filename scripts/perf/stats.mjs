// Small numeric helpers shared by summarize.mjs and compare.mjs.

// Nearest-rank percentiles over the numeric values; null when there are none.
export function stats(values) {
    const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    if (!sorted.length) {
        return null;
    }
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
    return { max: sorted.at(-1), median: pick(0.5), n: sorted.length, p90: pick(0.9) };
}

// Time of a region's last non-null signature change (e.g. the last hub card text).
export function lastChange(region) {
    const hits = region?.changes.filter((c) => c.sig !== null) ?? [];
    return hits.length ? hits.at(-1).t : null;
}

export function maxOf(values) {
    const numbers = values.filter((v) => typeof v === 'number');
    return numbers.length ? Math.max(...numbers) : null;
}
