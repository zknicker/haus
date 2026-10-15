import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRunLedger, ledgerFileName } from './state.mjs';

describe('crash ledger', () => {
    test('records this run and reads only what earlier runs left', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-state-'));
        const crashed = createRunLedger({ repositoryRoot, stamp: 'run_a' });
        await crashed.rememberAgent({ displayName: 'Eval Worker run_a-1', id: 'agt_a' });
        await crashed.rememberChat('cht_a');
        expect(await crashed.leftovers()).toEqual([]);

        const current = createRunLedger({ repositoryRoot, stamp: 'run_b' });
        await current.rememberChat('cht_b');
        expect(await current.leftovers()).toEqual([
            {
                agents: [{ displayName: 'Eval Worker run_a-1', handle: null, id: 'agt_a' }],
                chatIds: ['cht_a'],
                stamp: 'run_a',
            },
        ]);

        // A failed sweep confirms nothing, so the ids survive to the next run.
        expect(await current.leftovers()).toHaveLength(1);
        await current.forgetChats(['cht_a']);
        await current.forgetAgents(['agt_a']);
        expect(await current.leftovers()).toEqual([]);
    });

    test('adopts the standing pool ledger so its chats are still swept', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-legacy-'));
        const file = path.join(repositoryRoot, '.context', 'agent-tests', 'state.json');
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify({ chatsByHandle: { 'eval-worker-1': ['cht_old'] } }));

        const ledger = createRunLedger({ repositoryRoot, stackId: '', stamp: 'run_a' });
        expect(await ledger.leftovers()).toEqual([
            { agents: [], chatIds: ['cht_old'], stamp: 'standing-pool' },
        ]);
    });

    test('keys the ledger by dev stack so two stacks never sweep each other', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-stacks-'));
        const change = createRunLedger({
            repositoryRoot,
            stackId: 'eval-placement-change',
            stamp: 'run_a',
        });
        await change.rememberChat('cht_change');
        expect(path.basename(change.file)).toBe('state.eval-placement-change.json');
        expect(ledgerFileName(undefined)).toBe('state.json');
        expect(ledgerFileName('a/b')).toBe('state.a_b.json');

        const own = createRunLedger({ repositoryRoot, stackId: '', stamp: 'run_b' });
        expect(await own.leftovers()).toEqual([]);
        const next = createRunLedger({
            repositoryRoot,
            stackId: 'eval-placement-change',
            stamp: 'run_c',
        });
        expect(await next.leftovers()).toEqual([
            { agents: [], chatIds: ['cht_change'], stamp: 'run_a' },
        ]);
    });
});
