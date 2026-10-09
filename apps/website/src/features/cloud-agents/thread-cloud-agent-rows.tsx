import type { CloudAgentProvider, CloudAgentWork } from '@haus/api';
import type * as React from 'react';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { cloudAgentPresentationStatus, cloudAgentWorkBranch } from './cloud-agent-presentation.ts';
import { CloudAgentProviderGlyph } from './cloud-agent-provider-mark.tsx';
import { cloudAgentProviderName } from './cloud-agent-provider-presentation.ts';
import {
    cloudAgentStatusLabels,
    statusBreakdownText,
    summarizeThreadCloudAgentWork,
} from './thread-cloud-agent-summary.ts';

/**
 * One informational row per provider; the Thread surface's single button owns
 * every click. A lone work names itself, a fan-out reads as a count and a
 * status breakdown.
 */
export function ThreadCloudAgentRows({ works }: { works: readonly CloudAgentWork[] }) {
    return (
        <div
            className="pointer-events-none relative flex min-w-0 flex-col gap-1"
            data-testid="thread-cloud-agent-rows"
        >
            {summarizeThreadCloudAgentWork(works).map((summary) =>
                summary.kind === 'single' ? (
                    <ThreadCloudAgentRow
                        description={compactDescription(summary.work)}
                        key={summary.provider}
                        provider={summary.provider}
                        status={cloudAgentStatusLabels[cloudAgentPresentationStatus(summary.work)]}
                    />
                ) : (
                    <ThreadCloudAgentRow
                        description={`${summary.count} agents`}
                        key={summary.provider}
                        provider={summary.provider}
                        status={statusBreakdownText(summary)}
                    />
                )
            )}
        </div>
    );
}

function ThreadCloudAgentRow({
    description,
    provider,
    status,
}: {
    description: React.ReactNode;
    provider: CloudAgentProvider;
    status: string;
}) {
    return (
        <span className="flex min-w-0 items-center gap-1.5 text-sm leading-tight">
            <span
                className="flex shrink-0 items-center justify-center bg-default dark:inset-ring-[length:var(--hairline-width)] dark:inset-ring-foreground/80 dark:bg-background"
                style={{ borderRadius: identityMarkRadius(20), height: 20, width: 20 }}
            >
                <CloudAgentProviderGlyph className="scale-110" provider={provider} />
            </span>
            <span className="shrink-0 font-semibold text-foreground">
                {cloudAgentProviderName(provider)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted">{description}</span>
            <span className="shrink-0 text-muted text-xs">{status}</span>
        </span>
    );
}

/** A finished work states its diff when one was recorded, and otherwise its title. */
function compactDescription(work: CloudAgentWork): string {
    const diff = work.status === 'completed' ? cloudAgentWorkBranch(work)?.pullRequest : null;
    if (!diff) {
        return work.title;
    }
    return `${diff.changedFiles} ${diff.changedFiles === 1 ? 'file' : 'files'} changed · +${diff.additions} −${diff.deletions}`;
}
