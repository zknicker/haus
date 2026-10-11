import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTriggerCreate, runTriggerList } from './agent-trigger.ts';

const githubTrigger = {
    anchorChatId: 'cht_test',
    anchorMessageId: 'msg_test',
    anchorTarget: '#general',
    createdAt: '2026-10-11T10:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'usr_zach',
    disabledAt: null,
    fireCount: 0,
    github: {
        events: [{ actions: ['completed'], event: 'workflow_run' }],
        installationId: 'ghi_0123456789abcdef',
        installationLogin: 'acme',
        problem: null,
        problemSince: null,
        repositories: { scope: 'installation' },
        suppressedCount: 0,
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

test('lists a GitHub Trigger by its installation, with no URL', async () => {
    const written: string[] = [];
    await runTriggerList(args({}), {
        client: requester(() => ({ triggers: [githubTrigger] })),
        write: (text) => written.push(text),
    });

    expect(written.join('')).toBe(
        'trg_gh [github · armed] "CI failed" — never fired, anchored in #general — GitHub acme\n'
    );
});

test('refuses --kind github until the CLI can author one', async () => {
    const calls: string[] = [];
    await expect(
        runTriggerCreate(
            args({ '--kind': 'github', '--message-id': 'deadbeef', '--title': 'CI failed' }),
            {
                client: requester((route) => {
                    calls.push(route);
                    return {};
                }),
                write: () => undefined,
            }
        )
    ).rejects.toThrow('--kind github is not available yet.');
    expect(calls).toEqual([]);
});

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values };
}

function requester(respond: (route: string, input: AgentApiRequest) => unknown): AgentApiRequester {
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
