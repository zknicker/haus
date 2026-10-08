#!/usr/bin/env node
// Markdown summary of one or more interaction-harness result files: per kind
// (channel/DM switch, Agent profile open), one column per target × cpu × pass,
// median / p90 ms from pointerdown. "paint" = the rAF after the region first matched.
// Also lists the slowest tRPC batches and JS chunks requested after pointerdown.
//
// Usage: node scripts/perf/summarize.mjs .perf/results-*.json > .perf/summary.md
//   --json <file>  also write the computed stats as JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lastChange, maxOf, stats } from './stats.mjs';

const argv = process.argv.slice(2);
const jsonIndex = argv.indexOf('--json');
const jsonOut = jsonIndex >= 0 ? argv.splice(jsonIndex, 2)[1] : null;
const files = argv;
if (!files.length) {
    console.error('usage: summarize.mjs <results.json>... [--json <file>]');
    process.exit(1);
}

const hubCardTitles = ['Runs on', 'Profile', 'Automations', 'Skills', 'Connections', 'Workspace'];
const metrics = {
    channel: [
        ['url', (s) => s.url],
        ['header paint', (s) => s.regions.header?.frame],
        ['first rows paint', (s) => s.regions.firstRow?.frame],
        ['code highlighted', (s) => lastChange(s.regions.codeHighlight)],
        ['stable', (s) => s.stable],
        ['long tasks ms', (s) => s.longtasks.total],
        ['TBT', (s) => s.longtasks.tbt],
        ['LoAF blocking', (s) => s.loaf.blocking],
        ['tRPC reqs', (s) => s.trpc.length],
        ['chunks', (s) => s.chunks.length],
        ['DOM mutations', (s) => s.mainMutations],
    ],
    profile: [
        ['url', (s) => s.url],
        ['identity paint', (s) => s.regions.identity?.frame],
        [
            'hub cards complete',
            (s) => maxOf(hubCardTitles.map((t) => lastChange(s.regions[`card:${t}`]))),
        ],
        ['Chats rows paint', (s) => s.regions.chatRows?.frame],
        ['Recent activity rows', (s) => s.regions.activityRows?.frame],
        ['usage chart', (s) => s.regions.usageChart?.frame],
        ['stable', (s) => s.stable],
        ['TBT', (s) => s.longtasks.tbt],
        ['LoAF blocking', (s) => s.loaf.blocking],
        ['tRPC reqs', (s) => s.trpc.length],
        ['chunks', (s) => s.chunks.length],
    ],
};

const groups = new Map();
const trpcByTag = new Map();
const chunkLoads = new Map();
for (const file of files) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const tag = `${data.target} cpu×${data.cpu}`;
    for (const sample of data.runs.flatMap((r) => r.samples)) {
        collect(tag, sample);
    }
}

const summary = {};
const lines = ['# Haus App interaction summary', ''];
for (const kind of ['channel', 'profile']) {
    lines.push(...kindTable(kind));
}
lines.push('## Slowest tRPC batches (duration median / max ms, count)', '');
for (const [tag, byProc] of trpcByTag) {
    const rows = [...byProc.entries()]
        .map(([proc, durations]) => ({ ...stats(durations), count: durations.length, proc }))
        .sort((a, b) => b.median - a.median)
        .slice(0, 8);
    summary[`trpc|${tag}`] = rows;
    lines.push(`**${tag}**`, '');
    for (const r of rows) {
        lines.push(`- \`${r.proc}\` ${fmt(r.median)} / ${fmt(r.max)} (${r.count})`);
    }
    lines.push('');
}
lines.push('## JS chunks requested after pointerdown (path: total loads)', '');
for (const [key, byPath] of [...chunkLoads.entries()].sort()) {
    const loads = [...byPath.entries()].map(([p, n]) => `${path.basename(p)}×${n}`);
    lines.push(`- ${key}: ${loads.join(', ')}`);
}
console.log(lines.join('\n'));
if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
}

function collect(tag, sample) {
    const kind = sample.kind === 'profile' ? 'profile' : 'channel';
    const key = `${kind}|${tag}|${sample.pass}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
    const byProc = trpcByTag.get(tag) ?? new Map();
    trpcByTag.set(tag, byProc);
    for (const call of sample.trpc) {
        const name = call.procs.join('+');
        byProc.set(name, [...(byProc.get(name) ?? []), call.dur]);
    }
    const chunkKey = `${tag} | ${kind} ${sample.pass}`;
    const byPath = chunkLoads.get(chunkKey) ?? new Map();
    chunkLoads.set(chunkKey, byPath);
    for (const chunk of sample.chunks) {
        const name = chunk.path.replace(/-[\w-]{8}\.js$/, '.js').replace(/\?.*$/, '');
        byPath.set(name, (byPath.get(name) ?? 0) + 1);
    }
}

function kindTable(kind) {
    const title = kind === 'channel' ? 'Channel / DM switch' : 'Agent profile open';
    const keys = [...groups.keys()].filter((k) => k.startsWith(`${kind}|`)).sort();
    if (!keys.length) {
        return [];
    }
    const cols = keys.map((k) => k.split('|').slice(1).join(' '));
    const out = [`## ${title} (median / p90, ms)`, ''];
    out.push(`| metric | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const [name, get] of metrics[kind]) {
        const cells = keys.map((k) => {
            const st = stats(groups.get(k).map(get));
            summary[k] ??= { n: groups.get(k).length };
            summary[k][name] = st;
            return st ? `${fmt(st.median)} / ${fmt(st.p90)}` : '–';
        });
        out.push(`| ${name} | ${cells.join(' | ')} |`);
    }
    out.push(`| samples | ${keys.map((k) => groups.get(k).length).join(' | ')} |`, '');
    return out;
}

function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(0);
}
