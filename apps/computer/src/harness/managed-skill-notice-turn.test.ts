import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import {
    type ManagedSkillFactory,
    managedSkillChangeText,
    readManagedSkillChangeNotice,
    seedAgentManagedSkills,
} from '../managed-skill-changes.ts';
import {
    HarnessTurnFailedError,
    type HarnessTurnInput,
    runHarnessTurn,
    setHarnessAgentFactoryForTesting,
    setHarnessBootstrapRefreshForTesting,
} from './executor.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let agentRoot: string;
let failStream: boolean;
let prompts: string[];
let restore: () => void;
let restoreBootstrapRefresh: () => void;

const release = (visuals: string): ManagedSkillFactory => ({
    hashes: () => ({ visuals }),
    seed: async () => undefined,
});
const notice = managedSkillChangeText(['visuals']);

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-skill-notice-turn-'));
    failStream = false;
    prompts = [];
    restore = setHarnessAgentFactoryForTesting(() => fakeAgent());
    restoreBootstrapRefresh = setHarnessBootstrapRefreshForTesting(async () => undefined);
    await seedAgentManagedSkills(agentRoot, release('v1'));
    await seedAgentManagedSkills(agentRoot, release('v2'));
});

afterEach(async () => {
    restore();
    restoreBootstrapRefresh();
    await rm(agentRoot, { force: true, recursive: true });
});

test('a changed managed skill rides the next turn input once', async () => {
    await runHarnessTurn(turnInput());
    await runHarnessTurn(turnInput());

    expect(prompts[0]).toContain(notice);
    expect(prompts[1]).not.toContain('Haus skill update');
    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

test('a turn that fails keeps the notice for the next turn', async () => {
    failStream = true;
    await expect(runHarnessTurn(turnInput())).rejects.toBeInstanceOf(HarnessTurnFailedError);
    expect((await readManagedSkillChangeNotice(agentRoot))?.text).toBe(notice);

    failStream = false;
    await runHarnessTurn(turnInput());

    expect(prompts.at(-1)).toContain(notice);
    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

function fakeAgent(): Pick<HarnessAgent, 'createSession' | 'stream'> {
    return {
        createSession: (async () => ({
            destroy: async () => undefined,
            detach: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
            isResume: false,
            sessionId: 'engine_session_1',
            stop: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
        })) as unknown as HarnessAgent['createSession'],
        stream: (async (options: { prompt: string }) => {
            prompts.push(options.prompt);
            return { consumeStream: async () => undefined, fullStream: parts() };
        }) as unknown as HarnessAgent['stream'],
    };
}

async function* parts(): AsyncGenerator<unknown> {
    if (failStream) {
        yield { error: new Error('provider failed'), type: 'error' };
        return;
    }
    yield { totalUsage: undefined, type: 'finish' };
}

function turnInput(): HarnessTurnInput {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_test',
        agentName: 'Juniper',
        agentRoot,
        dataRoot: agentRoot,
        drainItemIds: [],
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtime,
        runtimeId: 'codex',
        serverId: 'srv_skill_notice_test',
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        tools: {},
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        webAccess: null,
        workspaceDir: join(agentRoot, 'workspace'),
    };
}
