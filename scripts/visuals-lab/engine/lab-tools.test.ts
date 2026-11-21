import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLabTools } from './lab-tools.mjs';

const root = await realpath(await mkdtemp(path.join(tmpdir(), 'haus-lab-tools-')));
afterAll(() => rm(root, { force: true, recursive: true }));
const agentsRoot = path.join(root, 'servers', 'srv_lab', 'agents');
const workspace = path.join(agentsRoot, 'agt_lab', 'workspace');
await mkdir(path.join(workspace, 'drive'), { recursive: true });
await writeFile(path.join(workspace, 'drive', 'SKILL.md'), 'read the design system\n');
const tools = createLabTools({ agentId: 'agt_lab', agentsRoot, runId: 'run_lab' });
const signal = new AbortController().signal;

test('bash runs on the lab machine in the Agent workspace', async () => {
    const outcome = await tools.bash('call_1', { command: 'cat drive/SKILL.md' }, signal);

    expect(outcome.isError).toBe(false);
    expect(outcome.content.at(0)).toMatchObject({ text: expect.stringContaining('design system') });
});

test('edit views a file through the Computer editor', async () => {
    const outcome = await tools.edit(
        'call_2',
        { command: 'view', path: path.join(workspace, 'drive', 'SKILL.md') },
        signal
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.content.at(0)).toMatchObject({ text: expect.stringContaining('design system') });
});

test('execute is refused because the lab has no Server', async () => {
    const outcome = await tools.execute('call_3', { code: '1' }, signal);

    expect(outcome.isError).toBe(true);
});
