import type { HausComponentFact } from './haus-update-model.ts';

export function HausVersionBreakdown({ facts }: { facts: readonly HausComponentFact[] }) {
    return (
        <dl className="grid gap-2.5 text-sm">
            {facts.map((fact) => {
                const display = factDisplay(fact);
                return (
                    <div className="grid gap-1" key={fact.id}>
                        <div className="flex items-baseline justify-between gap-8">
                            <dt className="min-w-0 truncate text-muted">{fact.label}</dt>
                            <dd
                                className={`${display.tone} whitespace-nowrap text-right font-mono tabular-nums`}
                            >
                                {display.value}
                            </dd>
                        </div>
                        {fact.status === 'failed' ? (
                            <dd className="grid gap-0.5 text-danger">
                                <span>{fact.detail ?? `${fact.label} could not update.`}</span>
                                {fact.remedy ? (
                                    <span className="text-foreground">{fact.remedy}</span>
                                ) : null}
                            </dd>
                        ) : null}
                    </div>
                );
            })}
        </dl>
    );
}

function factDisplay(fact: HausComponentFact) {
    if (fact.kind === 'website') {
        return { tone: 'text-muted', value: 'Reload available' };
    }
    if (!fact.targetVersion) {
        return { tone: 'text-muted', value: 'Unavailable' };
    }
    if (fact.status === 'external') {
        return { tone: 'text-muted', value: `${fact.targetVersion} · external` };
    }
    if (fact.status === 'current') {
        return { tone: 'text-success', value: `${fact.targetVersion} · up to date` };
    }
    if (fact.status === 'failed') {
        return {
            tone: 'text-danger',
            value: `${fact.currentVersion ?? 'Unknown'} → ${fact.targetVersion} · failed`,
        };
    }
    if (fact.status === 'updating') {
        return {
            tone: 'text-danger',
            value: `${fact.currentVersion ?? 'Unknown'} → ${fact.targetVersion} · updating`,
        };
    }
    return {
        tone: 'text-danger',
        value: `${fact.currentVersion ?? 'Unknown'} → ${fact.targetVersion} · update`,
    };
}
