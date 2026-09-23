import type { MessageRoutingAudit, MessageRoutingDebug } from '@haus/api';
import { Chip, Popover } from '@heroui/react';
import { routingExplanation, routingOutcomeLabel } from './routing-labels.ts';

export function RoutingDecisionPanel({
    audit,
    agents,
}: {
    audit: MessageRoutingAudit;
    agents: MessageRoutingDebug['agents'];
}) {
    const name = (id: string) => agents.find((agent) => agent.id === id)?.displayName ?? id;
    const names = (ids: string[]) => ids.map(name).join(', ') || 'None';
    const excluded =
        audit.outcome === 'narrow'
            ? audit.candidateAgentIds.filter((id) => !audit.recipientAgentIds.includes(id))
            : [];
    const status =
        audit.outcome === 'narrow'
            ? 'Narrowed'
            : audit.outcome === 'bypass'
              ? 'Jev skipped'
              : 'Normal delivery';
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <Popover.Heading className="text-base">Message routing</Popover.Heading>
                <Chip
                    className="text-base"
                    color={audit.outcome === 'narrow' ? 'accent' : 'default'}
                    size="lg"
                    variant="soft"
                >
                    {status}
                </Chip>
            </div>
            <div className="flex flex-col gap-2">
                <p className="text-base text-muted">Inbox recipients</p>
                <div className="flex flex-wrap gap-1.5">
                    {audit.recipientAgentIds.length ? (
                        audit.recipientAgentIds.map((id) => (
                            <Chip className="text-base" key={id} size="lg" variant="soft">
                                {name(id)}
                            </Chip>
                        ))
                    ) : (
                        <span className="text-base">None</span>
                    )}
                </div>
                <p className="text-base text-muted">{routingExplanation(audit)}</p>
            </div>
            {audit.model ? (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-base text-muted">Confidence</p>
                        <p className="font-medium text-base tabular-nums">
                            {percent(audit.confidence)}
                        </p>
                    </div>
                    <div>
                        <p className="text-base text-muted">Probability</p>
                        <p className="font-medium text-base tabular-nums">
                            {percent(audit.probability)}
                        </p>
                    </div>
                </div>
            ) : null}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-base">
                <dt className="text-muted">{audit.model ? 'Candidates' : 'Eligible agents'}</dt>
                <dd className="break-words text-right">{names(audit.candidateAgentIds)}</dd>
                <dt className="text-muted">Excluded by Jev</dt>
                <dd className="break-words text-right">{names(excluded)}</dd>
                <dt className="text-muted">Reply expected</dt>
                <dd className="text-right tabular-nums">
                    {audit.expectsReply === null ? 'Not recorded' : percent(audit.expectsReply)}
                </dd>
                {audit.model ? (
                    <>
                        <dt className="text-muted">Model choice</dt>
                        <dd className="break-words text-right">
                            {audit.choice ? name(audit.choice) : 'Unavailable'}
                        </dd>
                        <dt className="text-muted">Threshold</dt>
                        <dd className="text-right tabular-nums">
                            {percent(audit.threshold)} on both
                        </dd>
                        <dt className="text-muted">Decision time</dt>
                        <dd className="text-right tabular-nums">
                            {audit.elapsedMs === null ? 'Not recorded' : `${audit.elapsedMs} ms`}
                        </dd>
                        <dt className="text-muted">Model / prompt</dt>
                        <dd className="text-right">
                            {audit.model} / {audit.promptVersion}
                        </dd>
                    </>
                ) : (
                    <>
                        <dt className="text-muted">Jev</dt>
                        <dd className="text-right">Not called</dd>
                        <dt className="text-muted">Reason</dt>
                        <dd className="text-right">{routingOutcomeLabel(audit)}</dd>
                    </>
                )}
            </dl>
            <p className="text-base text-muted">
                Inbox delivery only. Reading and agent activity are tracked separately.
            </p>
        </div>
    );
}

function percent(value: number | null) {
    return value === null ? 'Unavailable' : `${Math.round(value * 100)}%`;
}
