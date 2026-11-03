import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { HarnessTurnInput } from './executor.ts';
import type { AgentSessionState } from './session-store.ts';

/** Executor turn inputs and session-file access for the instructions-update tests. */
export const updateOpening =
    '<haus-instructions-update>\nHaus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.\n\n';
export const updateTag = '<haus-instructions-update>';

export type TestTurnOverrides = Partial<Omit<HarnessTurnInput, 'activity'>> & {
    activity?: string[];
};

export interface InstructionsTurnHost {
    agentRoot: string;
    runtime: DaemonRuntime;
}

export function instructionsTurnInput(
    host: InstructionsTurnHost,
    overrides: TestTurnOverrides = {}
): HarnessTurnInput {
    const { activity, ...rest } = overrides;
    const { agentRoot, runtime } = host;
    return {
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            activity?.push(`${category}:${phase}`)
        ),
        agentId: 'agt_test',
        agentName: 'Cove',
        agentRoot,
        dataRoot: agentRoot,
        drainItemIds: ['msg_test'],
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [
            {
                chatId: 'cht_test',
                content: 'Hello Cove',
                createdAt: '2026-07-27T00:00:00.000Z',
                id: 'msg_test',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: 'dm:@operator',
            },
        ],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: 'claude-opus-4-8',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtime,
        runtimeId: 'claude-code',
        serverId: 'srv_test',
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        tools: [],
        totalPending: 1,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(agentRoot, 'workspace'),
        ...rest,
    };
}

export function instructionsWakeInput(
    host: InstructionsTurnHost,
    overrides: TestTurnOverrides
): HarnessTurnInput {
    return instructionsTurnInput(host, {
        drainItemIds: [],
        inbox: [],
        subagentWake: { createdAt: '2026-10-21T10:00:00.000Z', id: 'subagent:agt_test:wake_1' },
        totalPending: 0,
        ...overrides,
    });
}

export async function readSessionFile(agentRoot: string): Promise<AgentSessionState> {
    return JSON.parse(await readFile(join(agentRoot, 'session.json'), 'utf8')) as AgentSessionState;
}

export async function writeSessionFile(
    agentRoot: string,
    session: AgentSessionState
): Promise<void> {
    await writeFile(join(agentRoot, 'session.json'), `${JSON.stringify(session)}\n`);
}
