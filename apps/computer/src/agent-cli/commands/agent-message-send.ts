import { agentSendResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { renderSendResponse } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, requiredValue, valuesFor } from './agent-command-utils.ts';
import { defaultMessageDeps, type MessageDeps } from './agent-message-deps.ts';
import {
    HEREDOC_RECIPE,
    heredocError,
    optionalCause,
    validateDraftOptions,
} from './agent-message-input.ts';

/** The Server's body-validation refusal, which an older Server gives an unknown `done`. */
const INVALID_SEND_REQUEST = 'The message send request was invalid.';

export const messageSendSubcommand: SubCommand = {
    allowExtraPositionals: true,
    examples: [
        HEREDOC_RECIPE,
        'haus message send --target "#general" --reply-to 1a2b3c4d --done <<\'HAUSMSG\'\nThe deploy is green.\nHAUSMSG',
        'haus message send --send-draft --target "#general"',
        'haus message send --target "#general" --cause trf_41c2d8e9 <<\'HAUSMSG\'\nPayment webhook failed twice.\nHAUSMSG',
    ],
    flags: [
        { name: '--target', valueName: '<target>', description: 'Channel, DM, or thread target' },
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
        {
            name: '--done',
            description:
                'This message completes your reply in this chat; people there stop seeing you work. Omit on interim posts',
        },
        { name: '--send-draft', description: 'Send the saved draft unchanged' },
        { name: '--anyway', description: 'Send a repeatedly held draft despite new activity' },
        { name: '--content', description: 'Unsupported; message bodies use stdin' },
    ],
    name: 'send',
    positionals: [],
    run: (args) => runSend(args, defaultMessageDeps()),
    summary: 'Send a message body read only from stdin',
    usage: 'haus message send --target <t> [--reply-to <messageId>] [--attachment-id <id> ...] [--cause <fireId>] [--done] [--send-draft] [--anyway]',
};

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
    const done = Boolean(args.flags['--done']);
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
    const body = {
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        ...(cause ? { cause } : {}),
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(deps.compositionId ? { compositionId: deps.compositionId } : {}),
        ...(sendDraft ? {} : { content: stdin }),
        ...(continueAnyway ? { continueAnyway: true } : {}),
        ...(sendDraft ? { sendDraft: true } : {}),
        nonce: deps.mintNonce(),
        target,
    };
    const send = (withDone: boolean) =>
        deps.client.request('/api/agent/messages/send', agentSendResponseSchema, {
            body: withDone ? { ...body, done: true } : body,
            method: 'POST',
        });
    const response = await send(done).catch((error: unknown) => {
        // Computer releases ship before the Server that accepts `done`, and an
        // older Server refuses unknown fields before writing anything. Resend
        // plain; engagement then ends at turn end. Remove once every Server
        // accepts `done`.
        if (done && isInvalidSendRequest(error)) {
            return send(false);
        }
        throw error;
    });
    deps.write(renderSendResponse(target, response));
    return 0;
}

function isInvalidSendRequest(error: unknown): boolean {
    return (
        error instanceof AgentCliError &&
        error.code === 'INVALID_ARG' &&
        error.message === INVALID_SEND_REQUEST
    );
}
