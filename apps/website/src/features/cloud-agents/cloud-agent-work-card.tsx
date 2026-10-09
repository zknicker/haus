import type { CloudAgentBranch, CloudAgentWork } from '@haus/api';
import { Chip } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import {
    cloudAgentBranchPullRequestNumber,
    cloudAgentJobChipColor,
    cloudAgentJobText,
    cloudAgentWorkBranch,
} from './cloud-agent-presentation.ts';
import { CloudAgentProviderMark } from './cloud-agent-provider-mark.tsx';
import { CloudAgentStatusDisc } from './cloud-agent-status-disc.tsx';
import { cloudAgentStatusLine } from './cloud-agent-status-line.ts';
import { CloudAgentWorkActions } from './cloud-agent-work-actions.tsx';

/**
 * The Cloud Agent work under the Message that delegated it — the same card in
 * the Chat transcript and inside its Thread. It presents the Server-owned work
 * record, not a separate Chat row.
 *
 * Four parts, top to bottom: the header (provider mark, title, the job's
 * state, the repository), the pull request once one exists, exactly one status
 * line, and the actions. The headline is the job's state — Cursor's status
 * for the newest Run Cursor has received: working, done, failed, cancelled, or
 * expired — so a follow-up still in Haus's queue never turns a finished job
 * back into "queued". The status line is always there and always
 * one line, so the card changes height only when its pull request first
 * appears. Who delegated it and when is the Message's own author line directly
 * above, so the card does not repeat it.
 */
export function CloudAgentWorkCard({
    agentName,
    work,
}: {
    /** The delegating Agent, who sends any follow-up. */
    agentName: string;
    work: CloudAgentWork;
}) {
    const now = useRelativeNow(work.job.state === 'working' || work.job.followUp ? 5000 : 60_000);
    const branch = cloudAgentWorkBranch(work);
    const line = cloudAgentStatusLine(work, { agentName, now });

    return (
        <ActionCard
            actionKind="cloud-agent-work"
            actionStatus={work.job.state}
            aria-label={`Cloud Agent work: ${work.title}`}
            data-testid="cloud-agent-work-card"
        >
            <ActionCard.Header>
                <ActionCard.Mark>
                    <CloudAgentProviderMark provider={work.provider} />
                </ActionCard.Mark>
                <ActionCard.Content>
                    <ActionCard.Title>
                        {work.title}
                        <ActionCard.Status>
                            <Chip
                                color={cloudAgentJobChipColor(work.job.state)}
                                size="sm"
                                variant="soft"
                            >
                                <CloudAgentStatusDisc
                                    className="size-3 text-current"
                                    state={work.job.state}
                                />
                                <Chip.Label>{cloudAgentJobText(work.job, now)}</Chip.Label>
                            </Chip>
                        </ActionCard.Status>
                    </ActionCard.Title>
                    {/* The mark already names the provider, so the line under
                        the title carries only what the mark cannot: where. */}
                    <ActionCard.Description>{work.repository}</ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            <div className="flex min-w-0 flex-col gap-1">
                {branch ? <CloudAgentPullRequestRow branch={branch} /> : null}
                <ActionCard.Meta data-testid="cloud-agent-work-status-line" tone={line.tone}>
                    {line.text}
                </ActionCard.Meta>
            </div>
            <ActionCard.Actions>
                <CloudAgentWorkActions
                    pullRequestUrl={branch?.pullRequestUrl ?? null}
                    work={work}
                />
            </ActionCard.Actions>
        </ActionCard>
    );
}

/**
 * The result, once there is one: the pull request's number, its own state when
 * the Computer's GitHub reading has it, and the size of the change. Added and
 * removed are the one pair a reader scans without reading, so they keep color.
 */
export function CloudAgentPullRequestRow({ branch }: { branch: CloudAgentBranch }) {
    const number = cloudAgentBranchPullRequestNumber(branch);
    const pullRequest = branch.pullRequest ?? null;
    if (number === null) {
        return null;
    }
    return (
        <ActionCard.Meta data-testid="cloud-agent-work-pull-request">
            <Icon aria-hidden="true" icon={GitPullRequestIcon} />
            <span className="font-medium text-foreground">{`PR #${number}`}</span>
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
