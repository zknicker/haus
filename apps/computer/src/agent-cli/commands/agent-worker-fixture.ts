import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';

/** Shared across `haus worker`'s command tests. */
export const work = {
    activity: null,
    agentId: 'agt_orbit',
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    chatId: 'cht_product',
    computerId: 'cmp_studio',
    createdAt: '2026-09-04T12:00:00.000Z',
    environmentId: null,
    environmentName: null,
    id: 'caw_1234567890abcdef',
    job: { followUp: null, startedAt: null, state: 'working' },
    messageId: 'msg_1a2b3c4d5e6f7890',
    provider: 'cursor',
    providerAgentId: null,
    providerUrl: null,
    pullRequest: null,
    repository: 'haus/haus',
    turns: [],
    startedAt: null,
    startingRef: 'main',
    status: 'queued',
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    updatedAt: '2026-09-04T12:00:00.000Z',
};

export function args(overrides: Record<string, string> = {}): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: {},
        values: {
            '--ref': 'main',
            '--repo': 'haus/haus',
            '--say': 'Handing the flaky delivery test to a Worker.',
            '--task': 'SEC-12',
            '--title': 'Fix the flaky delivery test',
            ...overrides,
        },
    };
}

export function requester(seen: AgentApiRequest[], route: string[] = []): AgentApiRequester {
    return {
        request(path, schema, input) {
            route.push(path);
            seen.push(input ?? {});
            const receipt = {
                state: 'started',
                chatId: 'cht_product',
                idempotent: false,
                messageId: work.messageId,
                turnId: 'car_1234567890abcdef',
                sequence: 7,
                target: 'task:SEC-12',
                worker: work,
            };
            const response =
                input?.method !== 'POST'
                    ? { workers: [work] }
                    : path.endsWith('/cancel')
                      ? { worker: work }
                      : path.endsWith('/send')
                        ? {
                              worker: work,
                              turnId: receipt.turnId,
                              idempotent: false,
                              predecessors: [],
                          }
                        : receipt;
            return Promise.resolve(schema.parse(response));
        },
    };
}
