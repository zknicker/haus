import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prewarmBridgeStores } from './bridge-prewarm.ts';

describe('bridge store pre-warm', () => {
    let agentsRoot: string;

    beforeEach(async () => {
        agentsRoot = await mkdtemp(join(tmpdir(), 'bridge-prewarm-'));
    });

    afterEach(async () => {
        await rm(agentsRoot, { force: true, recursive: true });
    });

    test('runs every bridge install against the machine-wide shared store', async () => {
        const runs: Array<{ command: string; cwd: string }> = [];
        const lines: string[] = [];
        const storeDir = join(agentsRoot, 'machine-cache', 'harness-bridge-store');
        await prewarmBridgeStores({
            agentsRoot,
            log: (line) => lines.push(line),
            run: (command, cwd) => {
                runs.push({ command, cwd });
                return Promise.resolve(0);
            },
            storeDir,
        });

        expect(runs.length).toBeGreaterThanOrEqual(2);
        for (const run of runs) {
            expect(run.command).toContain(`--store-dir "${storeDir}"`);
            // The shared store must never be wiped by a verify retry.
            expect(run.command).not.toContain('.pnpm-store &&');
        }
        const codexRun = runs.find((run) => run.cwd.endsWith('/codex'));
        expect(codexRun?.command).toContain('resolve("@openai/codex/bin/codex.js")');

        const manifest = await readFile(
            join(agentsRoot, '.harness-bridge-prewarm', 'codex', 'package.json'),
            'utf8'
        );
        expect(manifest).toContain('"@agentclientprotocol/codex-acp"');
        expect(lines.filter((line) => line.includes('store warm'))).toHaveLength(runs.length);
    });

    test('can warm only the runtimes needed by a development Server', async () => {
        const runs: Array<{ command: string; cwd: string }> = [];
        await prewarmBridgeStores({
            agentsRoot,
            harnessIds: ['codex'],
            run: (command, cwd) => {
                runs.push({ command, cwd });
                return Promise.resolve(0);
            },
            storeDir: join(agentsRoot, 'machine-cache', 'harness-bridge-store'),
        });

        expect(runs).toHaveLength(1);
        expect(runs[0]?.cwd).toEndWith('/codex');
    });

    test('a failed warm logs and never throws — first bootstraps just fetch', async () => {
        const lines: string[] = [];
        await prewarmBridgeStores({
            agentsRoot,
            log: (line) => lines.push(line),
            run: () => Promise.resolve(1),
        });
        expect(lines.some((line) => line.includes('warm failed'))).toBe(true);
    });
});
