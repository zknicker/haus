import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';

export const work = {
    activity: null,
    agentId: 'agt_orbit',
    carrierComputerId: 'cmp_studio',
    closedAt: null,
    closingAt: null,
    createdAt: '2026-09-04T12:00:00.000Z',
    environmentId: null,
    environmentName: null,
    id: 'wkr_1234567890abcdef',
    job: { followUp: null, startedAt: null, state: 'working' },
    launchMessageId: null,
    originChatId: null,
    place: { kind: 'cursor' },
    providerAgentId: null,
    providerUrl: null,
    pullRequest: null,
    repository: 'haus/haus',
    startedAt: null,
    startingRef: 'main',
    status: 'queued',
    taskId: 'tsk_1234567890abcdef',
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    turns: [],
    updatedAt: '2026-09-04T12:00:00.000Z',
};

export function args(overrides: Record<string, string> = {}): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: {},
        values: {
            '--on': 'cursor',
            '--ref': 'main',
            '--repo': 'haus/haus',
            '--task': 'SEC-12',
            '--title': 'Fix the flaky delivery test',
            ...overrides,
        },
    };
}

export function requester(
    seen: AgentApiRequest[],
    route: string[] = [],
    worker: Record<string, unknown> = work
): AgentApiRequester {
    return {
        request(path, schema, input) {
            route.push(path);
            seen.push(input ?? {});
            const response =
                input?.method !== 'POST'
                    ? { workers: [worker] }
                    : path.endsWith('/stop')
                      ? { worker }
                      : path.endsWith('/send')
                        ? { idempotent: false, turnId: 'wkt_followup12345678', worker }
                        : { state: 'started', worker };
            return Promise.resolve(schema.parse(response));
        },
    };
}
