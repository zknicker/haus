import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';

export const githubTrigger = {
    anchorChatId: 'cht_test',
    anchorMessageId: 'msg_test',
    anchorTarget: '#general',
    createdAt: '2026-10-11T10:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'usr_zach',
    disabledAt: null,
    fireCount: 0,
    github: {
        events: [
            {
                actions: ['completed'],
                branches: ['main'],
                conclusions: ['failure'],
                event: 'workflow_run',
            },
        ],
        installationId: 'ghi_0123456789abcdef',
        installationLogin: 'acme',
        problem: null,
        problemSince: null,
        repositories: { names: ['acme/api'], scope: 'repositories' },
        suppressedCount: 2,
    },
    id: 'trg_gh',
    instruction: null,
    kind: 'github',
    lastFiredAt: null,
    ownerAgentId: 'agt_test',
    ownerHandle: 'blippy',
    status: 'armed',
    title: 'CI failed',
    updatedAt: '2026-10-11T10:00:00.000Z',
    version: 1,
};

export const installations = {
    installations: [
        {
            accessibleRepositoryCount: 3,
            account: { id: 7, login: 'Acme', type: 'Organization' },
            githubInstallationId: 42,
            id: 'ghi_0123456789abcdef',
            repositorySelection: 'all',
            status: 'active',
        },
    ],
};

export function args(
    values: Record<string, string>,
    lists: Record<string, string[]> = {}
): ParsedArgs {
    const merged = { ...values };
    for (const [flag, list] of Object.entries(lists)) {
        merged[flag] = list.at(-1) ?? '';
    }
    return { flags: {}, help: false, positionals: [], valueLists: lists, values: merged };
}

export function requester(
    respond: (route: string, input: AgentApiRequest) => unknown
): AgentApiRequester {
    return {
        async request<T>(
            route: string,
            schema: z.ZodType<T>,
            input: AgentApiRequest = {}
        ): Promise<T> {
            return schema.parse(respond(route, input));
        },
    };
}
