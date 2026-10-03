import type { CloudAgentBranch, CloudAgentPullRequest, CloudAgentWork } from '@haus/api';
import { Chip } from '@heroui/react';
import { Activity01Icon, GitBranchIcon, PlusMinus01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { formatRelativeTime } from '../../lib/format.ts';
import {
    cloudAgentBranchPullRequestNumber,
    cloudAgentPresentationStatus,
    cloudAgentStatusChipColor,
    cloudAgentStatusText,
    cloudAgentWorkActivityLine,
    cloudAgentWorkBranch,
    isCloudAgentWorkStale,
} from './cloud-agent-presentation.ts';
import { CloudAgentProviderMark } from './cloud-agent-provider-mark.tsx';
import { CloudAgentStatusDisc } from './cloud-agent-status-disc.tsx';
import { CloudAgentWorkActions } from './cloud-agent-work-actions.tsx';

/**
 * The Cloud Agent work under the Message that delegated it — the same card in
 * the Chat transcript and inside its Thread. The Agent says what it delegated
 * in its own Message, followed by this card. It presents the Server-owned work
 * record, not a separate Chat row.
 *
 * The card states facts, not prose. Top to bottom: what the work is and how it
 * is going, the branch it wrote and the pull request that branch opened, the
 * size of the diff, and one control band. The provider's Run report is
 * deliberately absent — the branch, the pull request, and the diff are the
 * evidence, and a paragraph of provider Markdown only pushed them down the
 * card. The provider itself is the mark, so nothing in the layout is named
 * after any one of them. Who delegated it and when is the Message's own author
 * line directly above, so the card does not repeat it. The way into the Thread
 * is the Message's own hover action or, once replies exist, the Thread preview
 * below the card.
 */
export function CloudAgentWorkCard({ work }: { work: CloudAgentWork }) {
    const now = useRelativeNow(work.terminalAt ? 60_000 : 5000);
    const status = cloudAgentPresentationStatus(work);
    const statusText = cloudAgentStatusText(work, now);
    const branch = cloudAgentWorkBranch(work);
    const pullRequest = branch?.pullRequest ?? null;
    const pullRequestNumber = branch ? cloudAgentBranchPullRequestNumber(branch) : null;
    // Progress is worth a glyph; a settled run already says so in one word and
    // in the chip's own color.
    const inProgress = status === 'queued' || status === 'running' || status === 'cancelling';

    return (
        <ActionCard
            actionKind="cloud-agent-work"
            actionStatus={work.status}
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
                                color={cloudAgentStatusChipColor(status)}
                                size="sm"
                                variant="soft"
                            >
                                {inProgress ? (
                                    <CloudAgentStatusDisc
                                        className="size-3 text-current"
                                        status={status}
                                    />
                                ) : null}
                                <Chip.Label>{statusText}</Chip.Label>
                            </Chip>
                        </ActionCard.Status>
                    </ActionCard.Title>
                    {/* The mark already names the provider, so the line under
                        the title carries only what the mark cannot: where. */}
                    <ActionCard.Description>{work.repository}</ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            {/* The repository is stated once, above. This row is the Git fact
                the run produced: the branch it wrote, and the pull request that
                branch opened — the part a reader is actually here for, so the
                branch gives way before the PR number does. */}
            <div className="flex min-w-0 flex-col gap-1">
                <ActionCard.Meta>
                    <Icon aria-hidden="true" icon={GitBranchIcon} />
                    {branchLabel(branch, work.repository, work.startingRef)}
                    {pullRequestNumber === null ? null : (
                        <span data-testid="cloud-agent-work-pull-request">
                            {' · '}
                            {`PR #${pullRequestNumber}`}
                        </span>
                    )}
                </ActionCard.Meta>
                {pullRequest ? <CloudAgentDiffRow pullRequest={pullRequest} /> : null}
                <CloudAgentActivityRow now={now} work={work} />
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
 * How big the change is, from the Computer's own GitHub reading. The two
 * counts are the only place on the card besides the status chip where color
 * carries meaning, because added and removed are the one pair a reader scans
 * without reading.
 */
function CloudAgentDiffRow({ pullRequest }: { pullRequest: CloudAgentPullRequest }) {
    return (
        <ActionCard.Meta data-testid="cloud-agent-work-diff">
            <Icon aria-hidden="true" icon={PlusMinus01Icon} />
            {`${pullRequest.changedFiles} ${pullRequest.changedFiles === 1 ? 'file' : 'files'} changed`}
            <span className="text-success"> +{pullRequest.additions}</span>
            <span className="text-danger"> −{pullRequest.deletions}</span>
        </ActionCard.Meta>
    );
}

/**
 * What a live work is doing right now, from the provider's latest report. A
 * settled work says nothing here — the branch, the pull request, and the diff
 * above are its outcome. A running work that has gone quiet says when it last
 * said anything, rather than gating on Computer connection state.
 */
export function CloudAgentActivityRow({ now, work }: { now: number; work: CloudAgentWork }) {
    const line = cloudAgentWorkActivityLine(work);
    const stale = isCloudAgentWorkStale(work, now);

    if (!(line || stale)) {
        return null;
    }

    return (
        <ActionCard.Meta data-testid="cloud-agent-work-activity">
            <Icon aria-hidden="true" icon={Activity01Icon} />
            {line}
            {line && stale ? ' · ' : null}
            {stale ? `Last update ${formatRelativeTime(work.updatedAt, now)}` : null}
        </ActionCard.Meta>
    );
}

/**
 * The branch fact, without repeating the repository the card already names. A
 * provider reporting a branch in some other repository — a fork, or a host that
 * qualifies its names — keeps that repository, because there it is the point.
 * Before any branch exists, the ref the run started from is the only one there
 * is, and says so.
 */
function branchLabel(
    branch: CloudAgentBranch | null,
    repository: string,
    startingRef: null | string
): string {
    if (!branch) {
        return startingRef ? `Base: ${startingRef}` : 'No branch yet';
    }
    return branch.repository === repository
        ? branch.branch
        : `${branch.repository} · ${branch.branch}`;
}
