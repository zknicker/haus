import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requestedTarget } from '../agent-tests/provisioner.mjs';
import { evals, resolveEval } from './evals.mjs';
import { heartbeatProfiles } from './profiles.mjs';

const scenarioNames = (
    await readdir(fileURLToPath(new URL('../agent-tests/scenarios/', import.meta.url)))
)
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => file.replace(/\.mjs$/u, ''));

test.each(Object.entries(evals))('%s names real scenarios', (_name, entry) => {
    for (const scenario of entry.scenarios) {
        expect(scenarioNames).toContain(scenario);
    }
});

test.each(
    Object.entries(evals)
)('%s selects exactly its scenarios through substring --only', (_name, entry) => {
    // cli.mjs matches --only by substring, so a name must not also select another scenario.
    const selected = scenarioNames.filter((scenario) =>
        entry.scenarios.some((only) => scenario.includes(only))
    );
    expect(selected.sort()).toEqual([...entry.scenarios].sort());
});

test.each(Object.entries(evals))('%s profiles only scenarios it runs', (_name, entry) => {
    for (const profiled of Object.keys(entry.profiles)) {
        expect(entry.scenarios).toContain(profiled);
    }
});

test('the placement profiles carry caps and spec ids for every graded scenario', () => {
    const { profiles, scenarios } = resolveEval('placement');
    for (const scenario of scenarios) {
        expect(profiles[scenario]?.spec).toBeTruthy();
        expect(Array.isArray(profiles[scenario].channel)).toBe(true);
    }
});

test.each(
    Object.entries(evals)
)('%s profiles carry a spec id, channel bounds, and a cap', (_name, entry) => {
    for (const profile of Object.values(entry.profiles)) {
        expect(profile.spec).toBeTruthy();
        expect(Array.isArray(profile.channel)).toBe(true);
        expect(profile.reaction || Number.isInteger(profile.cap)).toBe(true);
    }
});

test('the heartbeat eval runs its nine opt-in scenarios serially, graded by heartbeatProfiles', () => {
    const { lanes, profiles, scenarios } = resolveEval('heartbeat');
    expect(scenarios).toHaveLength(9);
    expect(lanes).toBe(1);
    expect(profiles).toEqual({});
    expect(Object.keys(heartbeatProfiles).sort()).toEqual([...scenarios].sort());
    for (const profile of Object.values(heartbeatProfiles)) {
        expect(profile.spec).toMatch(/^HB\d$/u);
    }
});

test('unknown and empty evals refuse to run', () => {
    expect(() => resolveEval('nope')).toThrow(/No eval named nope/u);
    evals.empty = { judge: null, profiles: {}, scenarios: [], summary: 'Empty.' };
    try {
        expect(() => resolveEval('empty')).toThrow(/no scenarios yet/u);
    } finally {
        Reflect.deleteProperty(evals, 'empty');
    }
});

test('--model reaches the provisioner as a runtime and model hint', () => {
    expect(requestedTarget(undefined)).toEqual({ modelHint: 'terra', runtimeId: 'codex' });
    expect(requestedTarget('claude-code/opus')).toEqual({
        modelHint: 'opus',
        runtimeId: 'claude-code',
    });
});
