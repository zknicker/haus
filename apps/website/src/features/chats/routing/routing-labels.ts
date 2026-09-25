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
    if (keptChoice(audit) !== null) {
        return keptLabel(audit);
    }
    if (audit.outcome === 'bypass') {
        return audit.bypassReason ? bypassLabels[audit.bypassReason] : 'Jev skipped';
    }
    if (audit.outcome === 'narrow' || audit.outcome === 'mentioned') {
        return audit.confidence === null ? 'Jev' : `Jev ${Math.round(audit.confidence * 100)}%`;
    }
    return {
        kept: keptLabel(audit),
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

/**
 * The choice behind a confident answer that kept ordinary delivery, or null.
 * Audits before 2026-09-25 recorded these as `uncertain`, so a stored
 * `uncertain` whose confidence met its threshold on a non-narrowing choice is
 * read as kept too.
 */
export function keptChoice(audit: MessageRoutingAudit) {
    if (audit.outcome === 'kept') {
        return audit.choice ?? '';
    }
    const confident =
        audit.outcome === 'uncertain' &&
        audit.choice !== null &&
        audit.confidence !== null &&
        audit.threshold !== null &&
        audit.confidence >= audit.threshold;
    if (!(confident && audit.choice)) {
        return null;
    }
    const narrowing = isMentionScopeJudgment(audit)
        ? audit.choice === 'mentioned'
        : !audienceKeptChoices.has(audit.choice);
    return narrowing ? null : audit.choice;
}

const audienceKeptChoices = new Set(['multiple', 'human', 'unclear']);
const keptLabels: Record<string, string> = {
    multiple: 'for everyone',
    human: 'for a human',
    unclear: 'audience unclear',
    others: 'other agents too',
};
function keptLabel(audit: MessageRoutingAudit) {
    const choice = keptChoice(audit) ?? '';
    return `Jev: ${keptLabels[choice] ?? (isMentionScopeJudgment(audit) ? 'scope unclear' : 'kept')}`;
}

function keptExplanation(audit: MessageRoutingAudit) {
    const choice = keptChoice(audit);
    if (isMentionScopeJudgment(audit)) {
        return choice === 'others'
            ? 'Jev judged this was for other agents too, not only the mentioned ones. Every agent in the channel was notified.'
            : 'Jev judged it unclear whether other agents were meant. Every agent in the channel was notified.';
    }
    switch (choice) {
        case 'multiple':
            return 'Jev judged this was for everyone in the channel. Normal delivery was kept.';
        case 'human':
            return 'Jev judged this was for a human. Normal delivery was kept.';
        default:
            return 'Jev judged the conversation does not say who this was for. Normal delivery was kept.';
    }
}

export function routingExplanation(audit: MessageRoutingAudit) {
    if (keptChoice(audit) !== null) {
        return keptExplanation(audit);
    }
    if (isMentionScopeJudgment(audit) && audit.outcome === 'uncertain') {
        return 'Jev’s confidence that the message was for the mentioned agents alone was below the threshold. Normal delivery was kept.';
    }
    switch (audit.outcome) {
        case 'kept':
            return keptExplanation(audit);
        case 'mentioned':
            return 'Jev judged the message was for the mentioned agents alone. Other agents in the channel were not notified.';
        case 'narrow':
            return audit.candidateAgentIds.length === 1
                ? 'Jev identified the only eligible agent as the addressee. Recipients are unchanged; the message is addressed to that agent.'
                : 'Jev identified one addressee. Only that agent received an inbox notification.';
        case 'uncertain':
            return 'Jev’s confidence was below the threshold, so it could not act on its answer. Normal delivery was kept.';
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
