import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const nodeTestTimeoutMs = 60_000;

/**
 * Oxlint's RuleTester refuses to run under Bun, so the valid and invalid
 * cases for each repo rule (`*.cases.mjs`) run through `node --test`.
 */
test(
    'every haus Oxlint rule passes its valid and invalid cases',
    () => {
        const cases = readdirSync(import.meta.dir)
            .filter((name) => name.endsWith('.cases.mjs'))
            .map((name) => join(import.meta.dir, name));
        expect(cases.length).toBeGreaterThan(0);
        const run = Bun.spawnSync(['node', '--test', ...cases], { stderr: 'pipe', stdout: 'pipe' });
        const output = `${run.stdout.toString()}${run.stderr.toString()}`;
        expect(output).toContain(`ℹ fail 0`);
        expect(run.exitCode, output).toBe(0);
    },
    nodeTestTimeoutMs
);
