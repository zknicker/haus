export class AgentSendModeError extends Error {
    constructor(
        message: string,
        readonly code: string,
        readonly status: number
    ) {
        super(message);
        this.name = 'AgentSendModeError';
    }
}

export function validateMode(input: {
    attachmentIds: string[];
    content?: string;
    continueAnyway: boolean;
    replyToMessageId?: string;
    sendDraft: boolean;
}) {
    if (input.continueAnyway && !input.sendDraft) {
        throw new AgentSendModeError(
            'continueAnyway requires sendDraft.',
            'SEND_DRAFT_ANYWAY_REQUIRES_SEND_DRAFT',
            400
        );
    }
    if (input.sendDraft && input.content !== undefined) {
        throw new AgentSendModeError(
            'sendDraft does not accept content.',
            'SEND_DRAFT_STDIN_UNSUPPORTED',
            400
        );
    }
    if (input.sendDraft && input.attachmentIds.length > 0) {
        throw new AgentSendModeError(
            'sendDraft does not accept attachment ids.',
            'SEND_DRAFT_ATTACHMENTS_UNSUPPORTED',
            400
        );
    }
    if (input.sendDraft && input.replyToMessageId !== undefined) {
        throw new AgentSendModeError(
            'sendDraft does not accept a reply target.',
            'SEND_DRAFT_REPLY_UNSUPPORTED',
            400
        );
    }
}

export function requireContent(content: string | undefined) {
    if (!content?.trim()) {
        throw new AgentSendModeError('Message content is required.', 'MISSING_CONTENT', 400);
    }
    return content;
}
