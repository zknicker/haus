import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

export const HEREDOC_RECIPE = `haus message send --target "#general" <<'HAUSMSG'\nBody with "quotes", $vars, \`backticks\`.\nHAUSMSG`;

export function validateDraftOptions({
    attachmentIds,
    continueAnyway,
    replyToMessageId,
    sendDraft,
}: {
    attachmentIds: string[];
    continueAnyway: boolean;
    replyToMessageId: string | undefined;
    sendDraft: boolean;
}) {
    if (continueAnyway && !sendDraft) {
        throw new AgentCliError(
            'SEND_DRAFT_ANYWAY_REQUIRES_SEND_DRAFT',
            '--anyway requires --send-draft.'
        );
    }
    if (sendDraft && attachmentIds.length > 0) {
        throw new AgentCliError(
            'SEND_DRAFT_ATTACHMENTS_UNSUPPORTED',
            '--send-draft does not accept --attachment-id.'
        );
    }
    if (sendDraft && replyToMessageId) {
        throw new AgentCliError(
            'SEND_DRAFT_REPLY_UNSUPPORTED',
            '--send-draft preserves the saved reply target; omit --reply-to.'
        );
    }
}

/**
 * `--cause` names the trigger or reminder fire this message answers. Only its
 * presence and non-emptiness are checked here; the Server owns fire existence,
 * ownership, and kind, and its INVALID_ARG message passes straight through.
 */
export function optionalCause(args: ParsedArgs): string | undefined {
    const raw = args.values['--cause'];
    if (raw === undefined) {
        return undefined;
    }
    const cause = raw.trim();
    if (!cause) {
        throw new AgentCliError('INVALID_ARG', '--cause requires a fire id.');
    }
    return cause;
}

export function heredocError(code: string, message: string): AgentCliError {
    return new AgentCliError(code, message, { nextAction: HEREDOC_RECIPE });
}
