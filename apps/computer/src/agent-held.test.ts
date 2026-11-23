import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentHeldFrameSchema } from '@haus/api';
import { sendAgentHeld } from './agent-held.ts';

const home = 'agt_homehomehomehome';
const visitor = 'agt_visitorvisitorvi';

let dataRoot: string;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-held-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('agent-held lists the Agent folders under the Server, and nothing that is not an Agent id', async () => {
    const agentsRoot = join(dataRoot, 'servers', 'srv_1', 'agents');
    for (const name of [visitor, home, 'agt_short', 'browser', '.DS_Store-dir']) {
        await mkdir(join(agentsRoot, name, 'workspace'), { recursive: true });
    }
    await writeFile(join(agentsRoot, 'agt_filefilefilefile'), 'not a folder');
    await mkdir(join(dataRoot, 'servers', 'srv_2', 'agents', 'agt_elsewhereelsewher'), {
        recursive: true,
    });
    const frames: unknown[] = [];

    await sendAgentHeld((frame) => frames.push(frame), dataRoot, 'srv_1');

    expect(frames).toEqual([{ agentIds: [home, visitor], type: 'agent-held' }]);
    expect(agentHeldFrameSchema.parse(frames[0])).toEqual({
        agentIds: [home, visitor],
        type: 'agent-held',
    });
});

test('agent-held is empty on a Computer that holds no Agent folders for the Server', async () => {
    const frames: unknown[] = [];

    await sendAgentHeld((frame) => frames.push(frame), dataRoot, 'srv_1');

    expect(frames).toEqual([{ agentIds: [], type: 'agent-held' }]);
});
