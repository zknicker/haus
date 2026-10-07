import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { formatInboxCheck } from '../agent-inbox-format.ts';
import {
    type AgentInboxPendingRow,
    type AgentInboxView,
    agentInboxCheckResponseSchema,
    agentInboxConversationsResponseSchema,
    agentInboxViews,
} from '../agent-inbox-schemas.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

interface InboxDeps {
    client: AgentApiRequester;
    now(): number;
    write(text: string): void;
}

const INBOX_UNAVAILABLE_NEXT_ACTION =
    'Retry in a moment; to drain new messages now use haus message check.';

export const INBOX_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus inbox check',
            'haus inbox check --view mentions',
            'haus inbox check --before 1190',
        ],
        flags: [
            { name: '--view', valueName: '<view>', description: 'unread (default) or mentions' },
            {
                name: '--before',
                valueName: '<seq>',
                description: 'Next page: the seq printed on the More: line',
            },
        ],
        name: 'check',
        positionals: [],
        run: (args) => runInboxCheck(args, defaultDeps()),
        summary:
            'List your unread conversations, newest activity first, each with the command that opens it (no flags needed).',
        usage: 'haus inbox check [--view unread|mentions] [--before <seq>]',
    },
];

export async function runInboxCheck(args: ParsedArgs, deps: InboxDeps): Promise<number> {
    const view = parseView(args.values['--view']);
    const before = parseBefore(args.values['--before']);
    const [list, pending] = await Promise.all([
        deps.client
            .request('/api/agent/inbox/conversations', agentInboxConversationsResponseSchema, {
                query: { before, view: view === 'unread' ? undefined : view },
            })
            .catch((error: unknown) => {
                throw inboxListFailure(error);
            }),
        readPendingSnapshot(deps.client),
    ]);
    const output = formatInboxCheck({
        ...(before === undefined ? {} : { before }),
        list,
        nowMs: deps.now(),
        ...pending,
        view,
    });
    deps.write(`${output}\n`);
    return 0;
}

function parseView(raw: string | undefined): AgentInboxView {
    if (raw === undefined) {
        return 'unread';
    }
    const view = agentInboxViews.find((candidate) => candidate === raw.trim());
    if (!view) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--view must be one of ${agentInboxViews.join(', ')}; got ${raw}`
        );
    }
    return view;
}

function parseBefore(raw: string | undefined): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const value = raw.trim();
    if (!/^[1-9][0-9]*$/u.test(value)) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--before must be a positive integer seq (copy it from the More: line); got ${raw}`
        );
    }
    return Number(value);
}

/** The list still renders without the queue snapshot; the output says what is missing. */
async function readPendingSnapshot(
    client: AgentApiRequester
): Promise<{ pendingError: string } | { pendingRows: AgentInboxPendingRow[] }> {
    try {
        const snapshot = await client.request('/api/agent/inbox', agentInboxCheckResponseSchema);
        return { pendingRows: snapshot.rows };
    } catch (error) {
        return { pendingError: error instanceof Error ? error.message : String(error) };
    }
}

function inboxListFailure(error: unknown): AgentCliError {
    if (error instanceof AgentCliError && error.code === 'INBOX_UNAVAILABLE') {
        return new AgentCliError(
            'INBOX_UNAVAILABLE',
            error.message || 'Inbox is temporarily unavailable',
            { nextAction: INBOX_UNAVAILABLE_NEXT_ACTION, retryable: true }
        );
    }
    if (error instanceof AgentCliError) {
        return new AgentCliError('INBOX_CHECK_FAILED', error.message, error.options);
    }
    return new AgentCliError(
        'INBOX_CHECK_FAILED',
        error instanceof Error ? error.message : String(error)
    );
}

function defaultDeps(): InboxDeps {
    return {
        client: createAgentApiClient(),
        now: () => Date.now(),
        write: (text) => process.stdout.write(text),
    };
}
