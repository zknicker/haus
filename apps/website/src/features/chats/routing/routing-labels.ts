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
    if (audit.outcome === 'narrow') {
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

export function routingExplanation(audit: MessageRoutingAudit) {
    switch (audit.outcome) {
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
