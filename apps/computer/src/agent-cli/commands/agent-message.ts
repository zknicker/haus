import { randomUUID } from 'node:crypto';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import {
    agentHistoryResponseSchema,
    agentMessageCheckResponseSchema,
    agentReactionResponseSchema,
    agentSendResponseSchema,
    resolvedAgentMessageSchema,
} from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import {
    formatAutomationEnvelope,
    formatDeliveryEnvelope,
    formatHistoryLine,
    shortMessageId,
} from '../agent-format.ts';
import { renderHistory, renderSendResponse } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    assertAgentTarget,
    optionalInteger,
    requiredValue,
    valuesFor,
} from './agent-command-utils.ts';
import { MESSAGE_ATTENTION_SUBCOMMANDS } from './agent-message-attention.ts';
import {
    HEREDOC_RECIPE,
    heredocError,
    optionalCause,
    validateDraftOptions,
} from './agent-message-input.ts';
import { messageSearchSubcommand } from './agent-message-search.ts';

const MAX_MESSAGE_CHECK_ROUNDS = 50;

interface MessageDeps {
    client: AgentApiRequester;
    compositionId?: string;
    mintNonce(): string;
    readStdin(): Promise<string>;
    stdinIsTty: boolean;
    write(text: string): void;
}

export const MESSAGE_SUBCOMMANDS: SubCommand[] = [
    ...MESSAGE_ATTENTION_SUBCOMMANDS,
    {
        allowExtraPositionals: true,
        examples: [
            HEREDOC_RECIPE,
            'haus message send --send-draft --target "#general"',
            'haus message send --target "#general" --cause trf_41c2d8e9 <<\'HAUSMSG\'\nPayment webhook failed twice.\nHAUSMSG',
        ],
        flags: [
            {
                name: '--target',
                valueName: '<target>',
                description: 'Channel, DM, or thread target',
            },
            {
                name: '--reply-to',
                valueName: '<messageId>',
                description: 'Reply inline to a message in this channel or DM',
            },
            {
                name: '--attachment-id',
                valueName: '<id>',
                description: 'Attach an uploaded file (repeatable)',
            },
            {
                name: '--cause',
                valueName: '<fireId>',
                description: 'Record the trigger or reminder fire this message answers',
            },
            { name: '--send-draft', description: 'Send the saved draft unchanged' },
            { name: '--anyway', description: 'Send a repeatedly held draft despite new activity' },
            { name: '--content', description: 'Unsupported; message bodies use stdin' },
        ],
        name: 'send',
        positionals: [],
        run: (args) => runSend(args, defaultDeps()),
        summary: 'Send a message body read only from stdin',
        usage: 'haus message send --target <t> [--reply-to <messageId>] [--attachment-id <id> ...] [--cause <fireId>] [--send-draft] [--anyway]',
    },
    {
        examples: [
            'haus message read --target "#general"',
            'haus message read --target "#general" --after 42',
        ],
        flags: [
            {
                name: '--target',
                valueName: '<target>',
                description: 'Channel, DM, or thread target',
            },
            {
                name: '--before',
                valueName: '<id-or-seq>',
                description: 'Read before this message or sequence',
            },
            {
                name: '--after',
                valueName: '<id-or-seq>',
                description: 'Read after this message or sequence',
            },
            {
                name: '--around',
                valueName: '<id-or-seq>',
                description: 'Read around this message or sequence',
            },
            { name: '--limit', valueName: '<n>', description: 'Maximum messages to return' },
        ],
        name: 'read',
        positionals: [],
        run: (args) => runRead(args, defaultDeps()),
        summary: 'Read canonical history for one target',
        usage: 'haus message read --target <t> [--before|--after|--around <idOrSeq>] [--limit <n>]',
    },
    messageSearchSubcommand,
    {
        examples: ['haus message resolve msg_1a2b3c4d'],
        flags: [],
        name: 'resolve',
        positionals: ['<id>'],
        run: (args) => runResolve(args, defaultDeps()),
        summary: 'Resolve one canonical message by short or full id',
        usage: 'haus message resolve <id>',
    },
    {
        examples: ['haus message check'],
        flags: [],
        name: 'check',
        positionals: [],
        run: () => runCheck(defaultDeps()),
        summary: 'Read and acknowledge pending message deliveries',
        usage: 'haus message check',
    },
    {
        examples: [
            'haus message react --message-id 1a2b3c4d --emoji 👍',
            'haus message react --message-id 1a2b3c4d --emoji 👍 --remove',
        ],
        flags: [
            { name: '--message-id', valueName: '<id>', description: 'Message to react to' },
            { name: '--emoji', valueName: '<e>', description: 'Reaction emoji' },
            { name: '--remove', description: 'Remove your matching reaction' },
        ],
        name: 'react',
        positionals: [],
        run: (args) => runReact(args, defaultDeps()),
        summary:
            'React only when a human asks or as a clear acknowledgement; never auto-react to routine events',
        usage: 'haus message react --message-id <id> --emoji <e> [--remove]',
    },
];

/** One drained envelope, kept with the identity that orders it against the rest. */
interface CheckedEnvelope {
    createdAt: string;
    id: string;
    line: string;
}

export async function runCheck(deps: MessageDeps): Promise<number> {
    const envelopes: CheckedEnvelope[] = [];
    let more = false;
    for (let round = 0; round < MAX_MESSAGE_CHECK_ROUNDS; round += 1) {
        const response = await deps.client.request(
            '/api/agent/events',
            agentMessageCheckResponseSchema
        );
        for (const row of response.messages) {
            envelopes.push({
                createdAt: row.message.created_at,
                id: row.message.id,
                line: formatDeliveryEnvelope(row.target, row.message, row.threadFollowReactivated),
            });
        }
        // A fire or a task assignment has no Chat message but is still an inbox
        // item: it must drain and page exactly like one.
        for (const event of response.automations) {
            envelopes.push({
                createdAt: event.createdAt,
                id: event.id,
                line: formatAutomationEnvelope(event),
            });
        }
        more = response.more;
        if (!more) {
            break;
        }
    }
    envelopes.sort(byCreatedAtThenId);
    const trailer = more
        ? 'More messages are pending — run haus message check again.'
        : envelopes.length === 0
          ? 'No new messages.'
          : 'No more new messages.';
    deps.write(`${[...envelopes.map((envelope) => envelope.line), trailer].join('\n')}\n`);
    return 0;
}

function byCreatedAtThenId(left: CheckedEnvelope, right: CheckedEnvelope): number {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime) || leftTime === rightTime) {
        return left.id.localeCompare(right.id);
    }
    return leftTime - rightTime;
}

export async function runSend(args: ParsedArgs, deps: MessageDeps): Promise<number> {
    if (args.flags['--content']) {
        throw heredocError('CONTENT_FLAG_UNSUPPORTED', '--content is not supported.');
    }
    if (args.positionals.length > 0) {
        throw heredocError(
            'POSITIONAL_CONTENT_UNSUPPORTED',
            'Positional message content is not supported.'
        );
    }
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    const sendDraft = Boolean(args.flags['--send-draft']);
    const continueAnyway = Boolean(args.flags['--anyway']);
    const attachmentIds = valuesFor(args, '--attachment-id');
    const replyToMessageId =
        args.values['--reply-to'] === undefined ? undefined : requiredValue(args, '--reply-to');
    const cause = optionalCause(args);
    validateDraftOptions({ attachmentIds, continueAnyway, replyToMessageId, sendDraft });
    const stdin = deps.stdinIsTty ? '' : await deps.readStdin();
    if (sendDraft && stdin.trim()) {
        throw new AgentCliError(
            'SEND_DRAFT_STDIN_UNSUPPORTED',
            '--send-draft does not accept stdin content.'
        );
    }
    if (!(sendDraft || stdin.trim())) {
        throw heredocError('MISSING_CONTENT', 'Message content is required on stdin.');
    }
    // One nonce per invocation keeps a re-driven send idempotent server-side.
    // No automatic transport retry: a lost held response must be re-driven by
    // the agent so the catch-up context is actually reviewed (spec §6).
    const response = await deps.client.request(
        '/api/agent/messages/send',
        agentSendResponseSchema,
        {
            body: {
                ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
                ...(cause ? { cause } : {}),
                ...(replyToMessageId ? { replyToMessageId } : {}),
                ...(deps.compositionId ? { compositionId: deps.compositionId } : {}),
                ...(sendDraft ? {} : { content: stdin }),
                ...(continueAnyway ? { continueAnyway: true } : {}),
                ...(sendDraft ? { sendDraft: true } : {}),
                nonce: deps.mintNonce(),
                target,
            },
            method: 'POST',
        }
    );
    deps.write(renderSendResponse(target, response));
    return 0;
}

export async function runRead(args: ParsedArgs, deps: MessageDeps): Promise<number> {
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    const anchors = ['--before', '--after', '--around'].filter((flag) => args.values[flag]);
    if (anchors.length > 1) {
        throw new AgentCliError('INVALID_ARG', 'Use only one of --before, --after, or --around.');
    }
    const response = await deps.client.request('/api/agent/history', agentHistoryResponseSchema, {
        query: {
            after: args.values['--after'],
            around: args.values['--around'],
            before: args.values['--before'],
            limit: optionalInteger(args, '--limit', { minimum: 1 }),
            target,
        },
    });
    deps.write(renderHistory(response));
    return 0;
}

export async function runResolve(args: ParsedArgs, deps: MessageDeps): Promise<number> {
    const id = args.positionals[0];
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'A message id is required.');
    }
    const response = await deps.client.request(
        `/api/agent/messages/${encodeURIComponent(id)}`,
        resolvedAgentMessageSchema
    );
    deps.write(`${formatHistoryLine(response.message)}\n`);
    return 0;
}

export async function runReact(args: ParsedArgs, deps: MessageDeps): Promise<number> {
    const messageId = args.values['--message-id'];
    const emoji = args.values['--emoji'];
    if (!messageId) {
        throw new AgentCliError('INVALID_ARG', 'Provide --message-id.');
    }
    if (!emoji) {
        throw new AgentCliError('INVALID_ARG', 'Provide --emoji.');
    }
    const remove = Boolean(args.flags['--remove']);
    const response = await deps.client.request(
        '/api/agent/messages/react',
        agentReactionResponseSchema,
        { body: { emoji, messageId, ...(remove ? { remove: true } : {}) }, method: 'POST' }
    );
    deps.write(
        `${remove ? 'Removed' : 'Reacted'} ${emoji} ${remove ? 'from' : 'to'} msg ${shortMessageId(response.message.id)}.\n`
    );
    return 0;
}

function defaultDeps(): MessageDeps {
    return {
        client: createAgentApiClient(),
        compositionId: process.env.HAUS_COMPOSITION_ID?.trim() || undefined,
        mintNonce: () => `cli-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: Boolean(process.stdin.isTTY),
        write: (text) => process.stdout.write(text),
    };
}

export const __test = { HEREDOC_RECIPE };
