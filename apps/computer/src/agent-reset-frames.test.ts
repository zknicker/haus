import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleAgentResetFrame } from './agent-reset-frames.ts';

const dataRoot = await mkdtemp(join(tmpdir(), 'haus-reset-frames-'));
const serverId = 'srv_reset';
const agentId = 'agt_offline';
const agentsDir = join(dataRoot, 'servers', serverId, 'agents');
const agentRoot = join(agentsDir, agentId);
const note = join(agentRoot, 'home', 'notes.md');
const reports: string[] = [];

afterAll(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

const deliver = async (frame: unknown) => {
    const work: Promise<unknown>[] = [];
    const handled = handleAgentResetFrame(frame, {
        agentsDir,
        dataRoot,
        report: () => {
            reports.push('report');
            return Promise.resolve();
        },
        resettingAgents: new Set(),
        retiredAgents: new Set(),
        serverId,
        track: (operation) => work.push(operation),
    });
    await Promise.all(work);
    return handled;
};

const configure = (sessionGeneration: number, sessionResetKind: 'full' | 'session') => ({
    agentDescription: null,
    agentId,
    agentName: 'Offline',
    modelId: 'claude-opus-5-5',
    runtimeId: 'claude-code',
    sessionGeneration,
    sessionResetKind,
    type: 'agent-configure',
});

const writeNote = async (text: string) => {
    await mkdir(join(agentRoot, 'home'), { recursive: true });
    await writeFile(note, text);
};

const marker = async () =>
    JSON.parse(await readFile(join(agentRoot, 'session-authority.json'), 'utf8')) as {
        generation: number;
    };

test('a full reset missed while offline clears the folder when the Computer reconnects', async () => {
    await writeNote('discarded before the reset');
    await mkdir(agentRoot, { recursive: true });
    await writeFile(join(agentRoot, 'session-authority.json'), '{"generation":1}\n');

    expect(await deliver(configure(2, 'full'))).toBe(true);

    expect(await Bun.file(note).exists()).toBe(false);
    expect(await marker()).toEqual({ generation: 2 });
    expect(reports).toEqual(['report']);
});

test('the same generation on a later reconnect keeps what the Agent wrote since', async () => {
    await writeNote('written after the reset');

    await deliver(configure(2, 'full'));

    expect(await readFile(note, 'utf8')).toBe('written after the reset');
    expect(reports).toEqual(['report']);
});

test('a session reset only advances the generation', async () => {
    await deliver(configure(3, 'session'));

    expect(await readFile(note, 'utf8')).toBe('written after the reset');
    expect(await marker()).toEqual({ generation: 3 });
});

test('a live full reset clears the folder once', async () => {
    const reset = { agentId, kind: 'full', sessionGeneration: 4, type: 'agent-reset' };

    await deliver(reset);
    await writeNote('after the live reset');
    await deliver(reset);

    expect(await readFile(note, 'utf8')).toBe('after the live reset');
    expect(await marker()).toEqual({ generation: 4 });
    expect(reports).toEqual(['report', 'report']);
});

test('frames that are not resets or configurations are left to other handlers', async () => {
    expect(await deliver({ type: 'drive-pull' })).toBe(false);
});
