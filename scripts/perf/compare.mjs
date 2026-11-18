#!/usr/bin/env node
// Before/after markdown table from pairs of interaction-harness result files.
// Channel rows pool channels and DMs. "paint" = the later of header and first-row
// paint (target surface displayed with rows AND exactly one header naming it).
//
// Usage: node scripts/perf/compare.mjs <before.json> <after.json> [<before2> <after2> ...]
//   e.g. node scripts/perf/compare.mjs .perf/baseline/results-prod-cpu1.json \
//          .perf/results-prod-cpu1.json .perf/baseline/results-prod-cpu4.json \
//          .perf/results-prod-cpu4.json
import { readFileSync } from 'node:fs';
import { maxOf, stats } from './stats.mjs';

const files = process.argv.slice(2);
if (!files.length || files.length % 2) {
    console.error('usage: compare.mjs <before.json> <after.json> [<before> <after> ...]');
    process.exit(1);
}

const groups = {
    channel: {
        kinds: ['channel', 'dm'],
        metrics: [
            ['paint (header + rows)', (s) => paint(s, ['header', 'firstRow'])],
            ['stable', (s) => s.stable],
            ['TBT', (s) => s.longtasks.tbt],
            ['DOM mutations', (s) => s.mainMutations],
        ],
        passes: ['cold', 'warm'],
        title: 'Channel / DM switch',
    },
    profile: {
        kinds: ['profile'],
        metrics: [
            ['identity', (s) => s.regions.identity?.frame],
            ['hub cards', (s) => s.regions.hubCards?.frame],
            ['lists (Chats + activity rows)', (s) => paint(s, ['chatRows', 'activityRows'])],
            ['stable', (s) => s.stable],
            ['TBT', (s) => s.longtasks.tbt],
        ],
        passes: ['first', 'cold', 'warm'],
        title: 'Agent profile open',
    },
};

const out = [];
for (let i = 0; i < files.length; i += 2) {
    const before = load(files[i]);
    const after = load(files[i + 1]);
    for (const def of Object.values(groups)) {
        out.push(...table(def, before, after));
    }
}
console.log(out.join('\n'));

function table(def, before, after) {
    const pick = (set, pass) =>
        set.samples.filter((s) => def.kinds.includes(s.kind) && s.pass === pass);
    const cellsFor = (fn) =>
        def.passes.flatMap((p) => [before, after].map((set) => fmt(pick(set, p).map(fn))));
    const counts = def.passes.flatMap((p) =>
        [before, after].map((set) => {
            const samples = pick(set, p);
            const flagged = samples.filter((s) => s.timedOut || s.missing.length).length;
            return `${samples.length} (${flagged})`;
        })
    );
    return [
        '',
        `### ${def.title}, ${after.tag} (median / p90 ms; before ${before.tag})`,
        '',
        `| metric | ${def.passes.map((p) => `${p} before | ${p} after`).join(' | ')} |`,
        `|---|${def.passes.map(() => '---|---').join('|')}|`,
        ...def.metrics.map(([name, fn]) => `| ${name} | ${cellsFor(fn).join(' | ')} |`),
        `| samples (timed out/missing) | ${counts.join(' | ')} |`,
    ];
}

function load(file) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { samples: data.runs.flatMap((r) => r.samples), tag: `${data.target} cpu×${data.cpu}` };
}

function paint(sample, regions) {
    return maxOf(regions.map((r) => sample.regions[r]?.frame));
}

function fmt(values) {
    const st = stats(values);
    return st ? `${Math.round(st.median)} / ${Math.round(st.p90)}` : 'n/a';
}
