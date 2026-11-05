import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';

/** Shared across `haus cloud-agent`'s command tests. */
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
    repository: 'haus/haus',
    runs: [],
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
            '--say': 'Handing the flaky delivery test to a cloud agent.',
            '--target': '#product',
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
                runId: 'car_1234567890abcdef',
                sequence: 7,
                target: '#product',
                work,
            };
            const response =
                input?.method !== 'POST'
                    ? { works: [work] }
                    : path.endsWith('/cancel')
                      ? { work }
                      : path.endsWith('/send')
                        ? { work, runId: receipt.runId, idempotent: false, predecessors: [] }
                        : receipt;
            return Promise.resolve(schema.parse(response));
        },
    };
}
