import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentDrive, readAgentDrive, recordAgentDriveHandle } from './agent-drive.ts';

let agentRoot: string;
beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-agent-drive-'));
});
afterEach(async () => {
    await rm(agentRoot, { force: true, recursive: true });
});

test("an Agent's Drive area sits in its folder under its handle", () => {
    expect(agentDrive('/data/agents/agt_1', 'scout')).toEqual({
        area: '/data/agents/agt_1/workspace/drive/agents/scout',
        folder: '/data/agents/agt_1/workspace/drive',
        handle: 'scout',
        memory: '/data/agents/agt_1/workspace/drive/agents/scout/MEMORY.md',
        skills: '/data/agents/agt_1/workspace/drive/agents/scout/skills',
    });
    expect(() => agentDrive('/data/agents/agt_1', '../escape')).toThrow(
        '"../escape" cannot name a Drive area.'
    );
    expect(() => agentDrive('/data/agents/agt_1', 'a/b')).toThrow();
});

test('the recorded handle locates the Drive area outside a launch', async () => {
    expect(await readAgentDrive(agentRoot)).toBeNull();
    await recordAgentDriveHandle(agentRoot, 'scout');
    expect(await readAgentDrive(agentRoot)).toEqual(agentDrive(agentRoot, 'scout'));
    await recordAgentDriveHandle(agentRoot, 'scout-2');
    expect((await readAgentDrive(agentRoot))?.area).toBe(
        join(agentRoot, 'workspace', 'drive', 'agents', 'scout-2')
    );
    expect(await readFile(join(agentRoot, 'runtime', 'drive-area.json'), 'utf8')).toBe(
        '{"handle":"scout-2"}\n'
    );
});
