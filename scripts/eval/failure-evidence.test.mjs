import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { failedScenarios, saveFailureEvidence } from './failure-evidence.mjs';

test('copies the newest evidence of each failed scenario written during the pass', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'haus-eval-evidence-'));
    const evidenceDir = path.join(root, 'heartbeat');
    const outDir = path.join(root, 'out');
    await mkdir(evidenceDir);
    await mkdir(outDir);
    const passStart = Date.now() - 60_000;
    const write = async (name, body, ageMs) => {
        const file = path.join(evidenceDir, name);
        await writeFile(file, body);
        const at = new Date(passStart + ageMs);
        await utimes(file, at, at);
    };
    await write('20261023100000-heartbeat-lead-dedupe.json', '"older pass"', -30_000);
    await write('20261023110000-heartbeat-lead-dedupe.json', '"this pass"', 10_000);
    await write('20261023110000-heartbeat-quiet-day-control.json', '"passed"', 10_000);

    const saved = await saveFailureEvidence({
        evidenceDir,
        failed: failedScenarios({
            scenarios: [
                { name: 'heartbeat-lead-dedupe', ok: false },
                { name: 'heartbeat-quiet-day-control', ok: true },
                { name: 'heartbeat-nightly-none', ok: false },
            ],
        }),
        outDir,
        prefix: 'pass-change-2',
        sinceMs: passStart,
    });

    const target = path.join(outDir, 'pass-change-2-heartbeat-lead-dedupe.evidence.json');
    expect(saved).toEqual([target]);
    expect(await readFile(target, 'utf8')).toBe('"this pass"');
});

test('a missing evidence directory saves nothing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'haus-eval-evidence-'));
    const saved = await saveFailureEvidence({
        evidenceDir: path.join(root, 'absent'),
        failed: ['heartbeat-lead-dedupe'],
        outDir: root,
        prefix: 'pass-change-1',
        sinceMs: 0,
    });
    expect(saved).toEqual([]);
});
