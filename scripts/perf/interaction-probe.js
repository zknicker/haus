// Init script injected via page.addInitScript before any app code runs (after
// interaction-probe-scenarios.js). Records interaction timing into window.__perf.
// interaction-harness.mjs arms a scenario (__perfArm), triggers it, polls
// __perfStatus() until the required regions are seen and the main pane is quiet,
// then reads __perfCollect(). All times are performance.now() ms.
//
// Records: long tasks, long animation frames (blocking + top scripts), resource
// timing (tRPC batches, chunk loads), history navigations, every childList /
// characterData mutation inside [data-slot=app-layout-main], and per-region
// first-seen + paint (rAF after first match) + later signature changes.
(() => {
    const MAIN = '[data-slot="app-layout-main"]';
    const perf = { armed: null, loafs: [], longtasks: [], nav: [], resources: [] };
    window.__perf = perf;

    const observe = (type, sink) => {
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    sink(e);
                }
            }).observe({ buffered: true, type });
        } catch {
            // Entry type unsupported in this browser; that metric stays empty.
        }
    };
    const scriptSummary = (s) => ({
        dur: Math.round(s.duration),
        fn: s.sourceFunctionName || '',
        invoker: (s.invoker || '').slice(0, 80),
        src: (s.sourceURL || '').replace(/^.*\/\/[^/]+/, '').slice(0, 120),
    });
    observe('longtask', (e) => perf.longtasks.push({ dur: e.duration, start: e.startTime }));
    observe('long-animation-frame', (e) =>
        perf.loafs.push({
            blocking: e.blockingDuration,
            dur: e.duration,
            scripts: (e.scripts || []).filter((s) => s.duration > 15).map(scriptSummary),
            start: e.startTime,
        })
    );
    observe('resource', (e) =>
        perf.resources.push({
            dur: e.duration,
            name: e.name,
            size: e.transferSize,
            start: e.startTime,
            ttfb: e.responseStart > 0 ? e.responseStart - e.startTime : null,
            type: e.initiatorType,
        })
    );

    const logNav = () =>
        perf.nav.push({ t: performance.now(), url: location.pathname + location.hash });
    for (const fn of ['pushState', 'replaceState']) {
        const orig = history[fn];
        history[fn] = function patched(...args) {
            const r = orig.apply(this, args);
            logNav();
            return r;
        };
    }
    window.addEventListener('popstate', logNav);
    window.addEventListener('hashchange', logNav);

    const main = () => document.querySelector(MAIN);

    const markSeen = (r, now) => {
        r.seen = now;
        requestAnimationFrame(() => {
            r.frame = performance.now();
        });
    };
    const runProbes = (now) => {
        const a = perf.armed;
        if (!a) {
            return;
        }
        for (const [key, probe] of Object.entries(a.probes)) {
            let sig = null;
            try {
                sig = probe();
            } catch {
                sig = null;
            }
            const r = a.regions[key];
            if (sig === r.sig) {
                continue;
            }
            r.changes.push({ sig, t: now });
            r.sig = sig;
            if (sig !== null && r.seen === null) {
                markSeen(r, now);
            }
        }
    };

    const describe = (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) {
            return '?';
        }
        const slotted = el.closest('[data-slot]');
        return `${el.tagName.toLowerCase()}${slotted ? `@${slotted.getAttribute('data-slot')}` : ''}`;
    };
    const inMainPane = (m, target) => m && (m.contains(target) || target.contains?.(m));

    const mo = new MutationObserver((records) => {
        const a = perf.armed;
        if (!a) {
            return;
        }
        const now = performance.now();
        const m = main();
        let inMain = 0;
        for (const rec of records) {
            if (rec.type === 'attributes' || !inMainPane(m, rec.target)) {
                continue;
            }
            inMain++;
            if (a.tail.length > 40) {
                a.tail.shift();
            }
            a.tail.push({
                added: rec.addedNodes.length,
                removed: rec.removedNodes.length,
                t: now,
                what: describe(rec.target),
            });
        }
        if (inMain) {
            a.mainMutations += inMain;
            a.lastMainMutation = now;
        }
        runProbes(now);
    });
    const startMo = () =>
        mo.observe(document.documentElement, {
            characterData: true,
            childList: true,
            subtree: true,
        });
    if (document.documentElement) {
        startMo();
    } else {
        document.addEventListener('readystatechange', startMo, { once: true });
    }

    const firstEvent = (type, key) =>
        document.addEventListener(
            type,
            (e) => {
                if (perf.armed && perf.armed[key] === null) {
                    perf.armed[key] = e.timeStamp;
                }
            },
            true
        );
    firstEvent('pointerdown', 't0');
    firstEvent('pointermove', 'hover');

    window.__perfArm = (scenario, params) => {
        const probes = window.__perfScenarios[scenario](params);
        const regions = {};
        for (const k of Object.keys(probes)) {
            regions[k] = { changes: [], frame: null, seen: null, sig: undefined };
        }
        perf.armed = {
            armedAt: performance.now(),
            hover: null,
            lastMainMutation: null,
            mainMutations: 0,
            params,
            probes,
            regions,
            scenario,
            t0: null,
            tail: [],
        };
        runProbes(performance.now());
        // Baseline: anything matched at arm time is pre-existing, not an outcome.
        for (const r of Object.values(regions)) {
            r.preMatched = r.sig !== null;
            r.seen = null;
            r.frame = null;
            r.changes = [];
        }
    };

    window.__perfStatus = () => {
        const a = perf.armed;
        const now = performance.now();
        const seen = {};
        for (const [k, r] of Object.entries(a.regions)) {
            seen[k] = r.seen !== null || (r.preMatched && r.sig !== null);
        }
        return {
            quietFor: now - (a.lastMainMutation ?? a.t0 ?? a.armedAt),
            seen,
            sinceT0: a.t0 === null ? null : now - a.t0,
            t0: a.t0,
        };
    };

    window.__perfCollect = (until) => {
        const a = perf.armed;
        const from = a.hover ?? a.t0;
        const end = until ?? performance.now();
        const overlaps = (l) => l.start + l.dur >= a.t0 && l.start <= end;
        perf.armed = null;
        const regions = {};
        for (const [k, r] of Object.entries(a.regions)) {
            const { changes, frame, preMatched, seen, sig } = r;
            regions[k] = { changes, final: sig, frame, preMatched, seen };
        }
        return {
            end,
            hover: a.hover,
            lastMainMutation: a.lastMainMutation,
            loafs: perf.loafs.filter(overlaps),
            longtasks: perf.longtasks.filter(overlaps),
            mainMutations: a.mainMutations,
            nav: perf.nav.filter((n) => n.t >= a.t0),
            params: a.params,
            regions,
            resources: perf.resources.filter((r) => r.start >= from - 5 && r.start <= end),
            scenario: a.scenario,
            t0: a.t0,
            tail: a.tail.slice(-12),
        };
    };
})();
