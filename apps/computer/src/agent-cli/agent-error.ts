import type { TaskClaimConflict } from '@haus/api';
import { formatTaskClaimConflict } from './agent-claim-conflict.ts';

export type AgentCliErrorCode =
    | 'AGENT_CREATE_ANNOUNCEMENT_MISSING_HANDLE'
    | 'AGENT_CREATE_IDEMPOTENCY_CONFLICT'
    | 'AGENT_CREATE_REFUSED'
    | 'AGENT_IDENTITY_PROTECTED'
    | 'AGENT_NO_COMPUTER'
    | 'AGENT_NOT_FOUND'
    | 'AMBIGUOUS_ID'
    | 'AVATAR_GENERATION_BUSY'
    | 'AVATAR_OUTPUT_INVALID'
    | 'AVATAR_PROVIDER_FAILED'
    | 'CHAT_VIEW_STALE'
    | 'CONTENT_FLAG_UNSUPPORTED'
    | 'IDEMPOTENCY_KEY_REUSED'
    | 'INFO_FAILED'
    | 'INTERNAL_BUG'
    | 'INVALID_ARG'
    | 'INVALID_JSON_RESPONSE'
    | 'INVALID_TARGET'
    | 'MISSING_AGENT_ID'
    | 'MISSING_CONTENT'
    | 'MISSING_SERVER_URL'
    | 'MISSING_TOKEN'
    | 'NOT_A_MEMBER'
    | 'NOT_YET_AVAILABLE'
    | 'OPERATOR_COMMAND_UNAVAILABLE'
    | 'POSITIONAL_CONTENT_UNSUPPORTED'
    | 'READ_FAILED'
    | 'RESOLVE_FAILED'
    | 'SEARCH_FAILED'
    | 'SEND_DRAFT_ANYWAY_REQUIRES_SEND_DRAFT'
    | 'SEND_DRAFT_ATTACHMENTS_UNSUPPORTED'
    | 'SEND_DRAFT_NOT_FOUND'
    | 'SEND_DRAFT_STDIN_UNSUPPORTED'
    | 'SEND_FAILED'
    | 'SERVER_5XX'
    | 'TARGET_NOT_FOUND'
    | 'TOKEN_FILE_EMPTY'
    | 'TOKEN_FILE_UNREADABLE';

export class AgentCliError extends Error {
    constructor(
        readonly code: AgentCliErrorCode | string,
        message: string,
        readonly options: {
            claimConflict?: TaskClaimConflict;
            draftSaved?: boolean;
            nextAction?: string;
            retryable?: boolean;
        } = {}
    ) {
        super(message);
        this.name = 'AgentCliError';
    }
}

/**
 * A claim conflict states itself — the structured block already names the
 * holder and the refusal — so it replaces the generic `Error:` line rather
 * than repeating it.
 */
export function renderAgentCliError(error: AgentCliError): string {
    const lead = error.options.claimConflict
        ? formatTaskClaimConflict(error.options.claimConflict)
        : `Error: ${error.message}`;
    const lines = [lead, `Code: ${error.code}`];
    if (error.options.draftSaved !== undefined) {
        lines.push(`Draft saved: ${error.options.draftSaved ? 'yes' : 'no'}`);
    }
    if (error.options.nextAction) {
        lines.push(`Next action: ${error.options.nextAction}`);
    }
    if (error.options.retryable) {
        lines.push('Retryable: yes');
    }
    return `${lines.join('\n')}\n`;
}
