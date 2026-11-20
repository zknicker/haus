import type { PullRequestReading, Worker, WorkerBranch } from '@haus/api';
import { Chip } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useWorkerAgentName } from './use-worker-agent-name.ts';
import { WorkerActions } from './worker-actions.tsx';
import {
    workerBranchPullRequestNumber,
    workerJobChipColor,
    workerBranch,
    workerText,
} from './worker-presentation.ts';
import { WorkerStatusDisc } from './worker-status-disc.tsx';
import { workerStatusLine } from './worker-status-line.ts';

export function WorkerCard({ children, work }: { children?: React.ReactNode; work: Worker }) {
    const agentName = useWorkerAgentName(work);
    const now = useRelativeNow(work.job.state === 'working' || work.job.followUp ? 5000 : 60_000);
    const branch = workerBranch(work);
    const line = workerStatusLine(work, { agentName, now });

    return (
        <ActionCard
            actionKind="worker"
            actionStatus={work.job.state}
            aria-label={`Worker: ${work.title}`}
            data-testid="worker-card"
        >
            <ActionCard.Header>
                <ActionCard.Mark>
                    <WorkerKeycap
                        environmentName={work.environmentName}
                        provider={work.place.kind === 'computer' ? null : work.place.kind}
                        size={40}
                    />
                </ActionCard.Mark>
                <ActionCard.Content>
                    <ActionCard.Title>
                        {work.title}
                        <ActionCard.Status>
                            <Chip
                                color={workerJobChipColor(work.job.state)}
                                size="sm"
                                variant="soft"
                            >
                                <WorkerStatusDisc
                                    className="size-3 text-current"
                                    state={work.job.state}
                                />
                                <Chip.Label>{workerText(work, now)}</Chip.Label>
                            </Chip>
                        </ActionCard.Status>
                    </ActionCard.Title>
                    {/* The mark already names the provider, so the line under
                        the title carries only what the mark cannot: where. */}
                    <ActionCard.Description>{work.repository}</ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            <div className="flex min-w-0 flex-col gap-1">
                {branch ? (
                    <WorkerPullRequestRow branch={branch} reading={work.pullRequest} />
                ) : null}
                <ActionCard.Meta data-testid="worker-status-line" tone={line.tone}>
                    {line.text}
                </ActionCard.Meta>
            </div>
            <ActionCard.Actions>
                <WorkerActions pullRequestUrl={branch?.pullRequestUrl ?? null} work={work} />
            </ActionCard.Actions>
            {children}
        </ActionCard>
    );
}

/**
 * The result, once there is one: the pull request's number, its own state when
 * the Computer's GitHub reading has it, and the size of the change. Added and
 * removed are the one pair a reader scans without reading, so they keep color.
 */
export function WorkerPullRequestRow({
    branch,
    reading = null,
}: {
    branch: WorkerBranch;
    /** The live reading, which outlives the Run's frozen snapshot. */
    reading?: PullRequestReading | null;
}) {
    const number = workerBranchPullRequestNumber(branch);
    const pullRequest = reading ?? branch.pullRequest ?? null;
    if (number === null) {
        return null;
    }
    return (
        <ActionCard.Meta data-testid="worker-pull-request">
            <Icon aria-hidden="true" icon={GitPullRequestIcon} />
            <span className="text-foreground font-medium">{`PR #${number}`}</span>
            {pullRequest ? (
                <>
                    {` · ${pullRequestStateLabels[pullRequest.state]} · `}
                    {`${pullRequest.changedFiles} ${pullRequest.changedFiles === 1 ? 'file' : 'files'}`}
                    <span className="text-success"> +{pullRequest.additions}</span>
                    <span className="text-danger"> −{pullRequest.deletions}</span>
                </>
            ) : null}
        </ActionCard.Meta>
    );
}

const pullRequestStateLabels = {
    closed: 'Closed',
    draft: 'Draft',
    merged: 'Merged',
    open: 'Open',
} as const;
