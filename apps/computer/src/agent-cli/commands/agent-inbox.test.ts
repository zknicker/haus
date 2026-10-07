import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runInboxCheck } from './agent-inbox.ts';

const NOW_MS = Date.parse('2026-09-25T12:00:00.000Z');

const listBody = {
    hasMore: false,
    items: [
        {
            activityKey: 1210,
            chatId: 'cht_richard',
            kind: 'dm',
            lastReadSequence: 1200,
            latestAt: '2026-09-25T11:48:00.000Z',
            latestSenderHandle: 'richard',
            mentions: 0,
            target: 'dm:@richard',
            unread: 3,
        },
    ],
    nextBefore: null,
    totals: { conversations: 1, dms: 1, mentions: 0 },
    view: 'unread',
};
const pendingBody = {
    rows: [
        {
            chatId: 'cht_richard',
            cloudAgentResult: false,
            firstSequence: 1201,
            firstShortId: 'first',
            latestSender: 'richard',
            latestShortId: 'first',
            mentioned: false,
            pendingCount: 2,
            target: 'dm:@richard',
            taskNumber: null,
        },
    ],
    totalPending: 2,
};

test('inbox check reads the Server list and the pending snapshot together', async () => {
    const routed = routedClient({ list: listBody, pending: pendingBody });
    const output = await inboxCheck(routed.client, { '--before': '1300' });

    expect(routed.requests.sort()).toEqual([
        '/api/agent/inbox',
        '/api/agent/inbox/conversations?before=1300',
    ]);
    expect(output).toBe(
        [
            'Inbox: 1 unread conversation (1 DM, 0 with mentions). Activity before seq 1300, newest first.',
            '',
            'dm:@richard · 3 unread · 2 new, not yet delivered · latest @richard 12m ago',
            '  open: haus message read --target "dm:@richard" --after 1200',
            '',
            'Next: open the first conversation above: haus message read --target "dm:@richard" --after 1200',
            '',
        ].join('\n')
    );
});

test('only the mentions view is sent as a parameter', async () => {
    const routed = routedClient({ list: listBody, pending: pendingBody });
    await inboxCheck(routed.client, {});
    await inboxCheck(routed.client, { '--view': 'mentions' });
    expect(routed.requests).toContain('/api/agent/inbox/conversations');
    expect(routed.requests).toContain('/api/agent/inbox/conversations?view=mentions');
});

test('inbox check still lists conversations when the pending snapshot fails', async () => {
    const routed = routedClient({
        list: listBody,
        pending: new AgentCliError('SERVER_5XX', 'The Haus server is unavailable.'),
    });
    const output = await inboxCheck(routed.client, {});
    expect(output).toContain('dm:@richard · 3 unread · latest @richard 12m ago');
    expect(output).toEndWith(
        'Pending queue unavailable (The Haus server is unavailable.); not-yet-delivered counts are not shown.\n'
    );
});

test('inbox check maps 503 INBOX_UNAVAILABLE to a retry hint', async () => {
    const routed = routedClient({
        list: new AgentCliError('INBOX_UNAVAILABLE', 'Inbox is temporarily unavailable', {
            retryable: true,
        }),
        pending: pendingBody,
    });
    const error = await inboxCheck(routed.client, {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AgentCliError);
    expect((error as AgentCliError).code).toBe('INBOX_UNAVAILABLE');
    expect((error as AgentCliError).message).toBe('Inbox is temporarily unavailable');
    expect((error as AgentCliError).options).toEqual({
        nextAction: 'Retry in a moment; to drain new messages now use haus message check.',
        retryable: true,
    });
});

test('any other list failure is INBOX_CHECK_FAILED with the Server message', async () => {
    const routed = routedClient({
        list: new AgentCliError('SERVER_5XX', 'The Haus server is unavailable.', {
            nextAction: 'Retry after the Haus Server is reachable.',
        }),
        pending: pendingBody,
    });
    const error = (await inboxCheck(routed.client, {}).catch(
        (caught: unknown) => caught
    )) as AgentCliError;
    expect(error.code).toBe('INBOX_CHECK_FAILED');
    expect(error.message).toBe('The Haus server is unavailable.');
    expect(error.options.nextAction).toBe('Retry after the Haus Server is reachable.');
});

test('inbox check rejects bad flags before network I/O', async () => {
    const routed = routedClient({ list: listBody, pending: pendingBody });
    await expect(inboxCheck(routed.client, { '--view': 'all' })).rejects.toThrow(
        '--view must be one of unread, mentions; got all'
    );
    await expect(inboxCheck(routed.client, { '--before': 'abc' })).rejects.toThrow(
        '--before must be a positive integer seq (copy it from the More: line); got abc'
    );
    await expect(inboxCheck(routed.client, { '--before': '0' })).rejects.toThrow(
        '--before must be a positive integer seq'
    );
    expect(routed.requests).toEqual([]);
});

async function inboxCheck(
    client: AgentApiRequester,
    values: Record<string, string>
): Promise<string> {
    let written = '';
    const args: ParsedArgs = { flags: {}, help: false, positionals: [], values };
    await runInboxCheck(args, {
        client,
        now: () => NOW_MS,
        write: (text) => {
            written += text;
        },
    });
    return written;
}

/** Answers each route with a body, or rejects with the given error. */
function routedClient(routes: { list: unknown; pending: unknown }) {
    const requests: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest) => {
            const query = Object.entries(input?.query ?? {})
                .filter(([, value]) => value !== undefined)
                .map(([name, value]) => `${name}=${value}`)
                .join('&');
            requests.push(query ? `${route}?${query}` : route);
            const answer = route === '/api/agent/inbox' ? routes.pending : routes.list;
            if (answer instanceof Error) {
                throw answer;
            }
            return schema.parse(answer);
        },
    };
    return { client, requests };
}
