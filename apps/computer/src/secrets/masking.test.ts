import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSecretsSchema, secretBindings } from './render.ts';

/**
 * Proves masking against the real Varlock binary this Computer ships, not a
 * description of it. A fake `op://` reference never needs to resolve: a
 * `.env.local` override resolves first, with no 1Password or network
 * dependency, so the child process gets real values while piped stdout only
 * ever sees the mask.
 */
const varlockBin = join(import.meta.dir, '../../../../node_modules/.bin/varlock');
const vaultId = 'vaultid0000000000000000001';
const itemId = 'item0000000000000000000001';
const primaryValue = 'literal-test-value-aaaa';
const secondaryValue = 'literal-test-value-bbbb';

describe('Varlock masking', () => {
    test('masks a primary and a secondary binding in piped stdout, but still injects both', async () => {
        const bindings = secretBindings(
            vaultId,
            [{ field: 'credential', id: itemId, title: 'Dummy API Key' }],
            [{ fieldId: 'username', itemId, label: 'username' }]
        );
        const dir = await mkdtemp(join(tmpdir(), 'haus-secrets-masking-'));
        try {
            await writeFile(join(dir, '.env.schema'), renderSecretsSchema(bindings));
            await writeFile(
                join(dir, '.env.local'),
                `DUMMY_API_KEY=${primaryValue}\nDUMMY_API_KEY_USERNAME=${secondaryValue}\n`
            );
            const proofFile = join(dir, 'proof.txt');
            const child = Bun.spawn(
                [
                    varlockBin,
                    'run',
                    '--path',
                    `${dir}/`,
                    '--inject',
                    'vars',
                    '--',
                    'node',
                    '-e',
                    'var v = [process.env.DUMMY_API_KEY, process.env.DUMMY_API_KEY_USERNAME]; ' +
                        "require('fs').writeFileSync(process.argv[1], v.join('|')); " +
                        "console.log('value:', v[0], v[1]);",
                    proofFile,
                ],
                { stderr: 'pipe', stdout: 'pipe' }
            );
            const [stdout, exitCode] = await Promise.all([
                new Response(child.stdout).text(),
                child.exited,
            ]);
            expect(exitCode).toBe(0);
            expect(stdout).not.toContain(primaryValue);
            expect(stdout).not.toContain(secondaryValue);
            expect(await readFile(proofFile, 'utf8')).toBe(`${primaryValue}|${secondaryValue}`);
        } finally {
            await rm(dir, { force: true, recursive: true });
        }
    });
});
