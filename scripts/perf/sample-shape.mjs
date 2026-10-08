// Turns one raw __perfCollect() record into a result sample: every time is ms
// relative to pointerdown (t0). The window for long tasks and LoAF blocking ends
// at the last main-pane mutation ("stable").

export function shapeSample(raw, required, isTargetNav) {
    const rel = (t) => (t === null || t === undefined ? null : round(t - raw.t0));
    const nav = raw.nav.find(isTargetNav);
    const regions = Object.fromEntries(
        Object.entries(raw.regions).map(([k, r]) => [
            k,
            {
                changes: r.changes.map((c) => ({ sig: c.sig, t: rel(c.t) })),
                final: r.final,
                frame: rel(r.frame),
                preMatched: r.preMatched,
                seen: rel(r.seen),
            },
        ])
    );
    const windowEnd = raw.lastMainMutation ?? raw.end;
    const longtasks = raw.longtasks.filter((l) => l.start <= windowEnd);
    const loafs = raw.loafs.filter((l) => l.start <= windowEnd);
    const resources = raw.resources.map((r) => ({
        ...r,
        dur: round(r.dur),
        start: rel(r.start),
        ttfb: r.ttfb === null ? null : round(r.ttfb),
    }));
    const chunks = resources.filter(isChunk).map((r) => ({
        dur: r.dur,
        path: new URL(r.name).pathname,
        size: r.size,
        start: r.start,
    }));
    const other = resources.filter((r) => !(isTrpc(r) || isChunk(r)));
    return {
        chunks,
        hoverLead: raw.hover === null ? null : round(raw.t0 - raw.hover),
        lateMutations: raw.tail.map((m) => ({ ...m, t: rel(m.t) })),
        loaf: summarizeLoafs(loafs, rel),
        longtasks: summarizeLongtasks(longtasks, rel),
        mainMutations: raw.mainMutations,
        missing: required.filter((k) => regions[k]?.seen === null && !regions[k]?.preMatched),
        otherRequests: other.map((r) => ({
            dur: r.dur,
            path: new URL(r.name).pathname.slice(0, 80),
            start: r.start,
        })),
        regions,
        stable: raw.lastMainMutation === null ? null : rel(raw.lastMainMutation),
        timedOut: raw.timedOut,
        trpc: resources.filter(isTrpc).map(trpcCall),
        url: nav ? rel(nav.t) : null,
    };
}

function isTrpc(r) {
    return r.name.includes('/trpc/');
}

function isChunk(r) {
    return !isTrpc(r) && /\.(m?js|css|tsx?|jsx)(\?|$)/.test(new URL(r.name).pathname);
}

function trpcCall(r) {
    const procedures = decodeURIComponent(new URL(r.name).pathname.split('/trpc/')[1]);
    return { dur: r.dur, procs: procedures.split(','), size: r.size, start: r.start, ttfb: r.ttfb };
}

function summarizeLongtasks(list, rel) {
    return {
        count: list.length,
        list: list.map((l) => [rel(l.start), round(l.dur)]),
        max: round(Math.max(0, ...list.map((l) => l.dur))),
        tbt: round(sum(list.map((l) => Math.max(0, l.dur - 50)))),
        total: round(sum(list.map((l) => l.dur))),
    };
}

function summarizeLoafs(list, rel) {
    return {
        blocking: round(sum(list.map((l) => l.blocking))),
        count: list.length,
        frames: list.map((l) => ({
            blocking: round(l.blocking),
            dur: round(l.dur),
            start: rel(l.start),
        })),
        topScripts: list
            .flatMap((l) => l.scripts)
            .sort((a, b) => b.dur - a.dur)
            .slice(0, 6),
    };
}

function sum(xs) {
    return xs.reduce((a, b) => a + b, 0);
}

function round(n) {
    return Math.round(n * 10) / 10;
}
