import type { MessageRoutingAudit, RoutingBypassReason } from '@haus/api';

const bypassLabels: Record<RoutingBypassReason, string> = {
    disabled: 'routing off',
    'direct-message': 'direct message',
    thread: 'thread',
    reply: 'explicit reply',
    mention: 'explicit mention',
    attachments: 'attachments',
    'recipient-count': 'fewer than two agents',
    sole: 'sole agent and human',
    'context-limit': 'context limit',
    'no-context': 'no prior context',
};
export function routingOutcomeLabel(audit: MessageRoutingAudit) {
    if (audit.outcome === 'bypass') {
        return audit.bypassReason ? bypassLabels[audit.bypassReason] : 'Jev skipped';
    }
    if (audit.outcome === 'narrow' || audit.outcome === 'mentioned') {
        return audit.confidence === null ? 'Jev' : `Jev ${Math.round(audit.confidence * 100)}%`;
    }
    return {
        uncertain: 'uncertain',
        timeout: 'timeout',
        failure: 'provider error',
        invalid: 'invalid result',
        stale: 'context changed',
    }[audit.outcome];
}

/** A judged audit whose trigger was an @mention asked the mention-scope question. */
export function isMentionScopeJudgment(audit: MessageRoutingAudit) {
    return audit.model !== null && audit.bypassReason === 'mention';
}

const mentionScopeChoices: Record<string, string> = {
    mentioned: 'Mentioned agents only',
    others: 'Other agents too',
    unclear: 'Unclear',
};
export function mentionScopeChoiceLabel(choice: string) {
    return mentionScopeChoices[choice] ?? choice;
}

export function routingExplanation(audit: MessageRoutingAudit) {
    if (isMentionScopeJudgment(audit) && audit.outcome === 'uncertain') {
        return 'Jev did not confirm, above both thresholds, that the message was for the mentioned agents alone. Normal delivery was preserved.';
    }
    switch (audit.outcome) {
        case 'mentioned':
            return 'Jev judged the message was for the mentioned agents alone. Other agents in the channel were not notified.';
        case 'narrow':
            return audit.candidateAgentIds.length === 1
                ? 'Jev identified the only eligible agent as the addressee. Recipients are unchanged; the message is addressed to that agent.'
                : 'Jev identified one addressee. Only that agent received an inbox notification.';
        case 'uncertain':
            return 'Jev did not identify one eligible agent above both thresholds. Normal delivery was preserved.';
        case 'timeout':
            return 'Jev exceeded the 1.5-second deadline. Normal delivery was preserved.';
        case 'failure':
            return 'The provider request failed. Normal delivery was preserved.';
        case 'invalid':
            return 'The result failed validation. Normal delivery was preserved.';
        case 'stale':
            return 'The conversation or eligible agents changed during inference. The judgment was discarded and current delivery rules were used.';
        case 'bypass':
            return audit.bypassReason === 'sole'
                ? 'The only eligible agent and the only human share this channel, so the message is addressed to that agent without Jev.'
                : `Jev was skipped: ${routingOutcomeLabel(audit)}. Recipients came from the normal delivery rules.`;
    }
}
