// The scenario contract: the dependency-free expectation helper every scenario
// is handed, the scenario module shape, and the guard that keeps a scenario
// from reaching for a matcher that does not exist.

import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssertionError, createExpect, defineScenario, isScenario } from './scenario.mjs';

describe('expect helper', () => {
    test('records passing gates', () => {
        const assertions = [];
        createExpect(assertions)('in_progress', 'task status').toBe('in_progress');
        expect(assertions).toEqual([{ label: 'task status', ok: true }]);
    });

    test('reports the actual value on failure', () => {
        const assertions = [];
        const check = createExpect(assertions);
        expect(() => check('todo', 'task status').toBe('in_progress')).toThrow(AssertionError);
        expect(assertions[0].ok).toBe(false);
        expect(assertions[0].message).toBe('task status: expected "in_progress", got "todo"');
    });

    test('names the container on length and containment failures', () => {
        const check = createExpect();
        expect(() => check(['a', 'b'], 'replies').toHaveLength(1)).toThrow(
            'replies: expected length 1, got 2 in ["a", "b"]'
        );
        expect(() => check('no token here', 'reply').toContain('EVAL-ABC123')).toThrow(
            'reply: expected "no token here" to contain "EVAL-ABC123"'
        );
    });

    // A scenario that reaches for a matcher the helper does not have (`.not`,
    // `toEqual`) fails as a bare TypeError minutes into a live run, after real
    // turns have already been spent. Reading the vocabulary off the helper
    // itself catches that here instead, in a second and offline.
    test('every scenario calls only matchers the helper exposes', async () => {
        const vocabulary = new Set(Object.keys(createExpect()(null)));
        const directory = fileURLToPath(new URL('./scenarios/', import.meta.url));
        const files = (await readdir(directory)).filter((entry) => entry.endsWith('.mjs'));
        expect(files.length).toBeGreaterThan(0);
        const unsupported = [];
        for (const file of files) {
            const source = await readFile(path.join(directory, file), 'utf8');
            for (const matcher of scenarioMatchers(source)) {
                if (!vocabulary.has(matcher)) {
                    unsupported.push(`${file}: .${matcher}`);
                }
            }
        }
        expect(unsupported).toEqual([]);
    });
});

/** Names the matcher each `expect(...)` in a scenario source reaches for. */
function scenarioMatchers(source) {
    const matchers = [];
    const openings = /\bexpect\(/gu;
    for (let found = openings.exec(source); found; found = openings.exec(source)) {
        const close = closingParenthesis(source, openings.lastIndex - 1);
        if (close === -1) {
            continue;
        }
        const chained = /^\s*\.\s*([A-Za-z_$][\w$]*)/u.exec(source.slice(close + 1));
        if (chained) {
            matchers.push(chained[1]);
        }
    }
    return matchers;
}

function closingParenthesis(source, openIndex) {
    let depth = 0;
    for (let index = openIndex; index < source.length; index += 1) {
        if (source[index] === '(') {
            depth += 1;
        } else if (source[index] === ')') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

describe('defineScenario', () => {
    test('normalizes agent requests and marks the module shape', () => {
        const scenario = defineScenario({
            agents: ['worker', { cleanWorkspace: true, kind: 'worker' }],
            name: '  demo  ',
            run: () => undefined,
        });
        expect(isScenario(scenario)).toBe(true);
        expect(scenario.name).toBe('demo');
        // A provisioned Agent is new, so only the kind survives normalization.
        expect(scenario.agents).toEqual([{ kind: 'worker' }, { kind: 'worker' }]);
    });

    test('rejects unknown agent kinds and missing run functions', () => {
        const unknownKind = () =>
            defineScenario({ agents: ['captain'], name: 'x', run: () => undefined });
        expect(unknownKind).toThrow(/Unknown agent kind/u);
        expect(() => defineScenario({ name: 'x' })).toThrow(/needs a run function/u);
    });

    test('marks opt-in scenarios without changing the default shape', () => {
        const scenario = defineScenario({
            name: 'live-only',
            optIn: true,
            run: () => undefined,
        });
        expect(scenario.optIn).toBe(true);
        expect(isScenario(scenario)).toBe(true);
    });
});
