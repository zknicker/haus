import type { PullRequestReading, WorkerBranch } from '@haus/api';
import { workerPullRequestNumber } from '@haus/api';
import { Link } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { workerBranchPullRequestNumber } from './worker-presentation.ts';

export function WorkerPullRequestRow({
    branch,
    reading = null,
    reportUrls = [],
}: {
    branch: null | WorkerBranch;
    reading?: null | PullRequestReading;
    reportUrls?: readonly string[];
}) {
    const url = reading?.url ?? branch?.pullRequestUrl ?? reportUrls[0] ?? null;
    if (url === null) {
        return null;
    }
    const number =
        reading?.number ??
        (branch?.pullRequestUrl ? workerBranchPullRequestNumber(branch) : null) ??
        workerPullRequestNumber(url);
    const facts = reading ?? branch?.pullRequest ?? null;
    return (
        <div
            className="text-muted flex min-w-0 items-center gap-1.5 text-sm leading-5"
            data-testid="worker-pull-request"
        >
            <Icon aria-hidden="true" className="shrink-0" icon={GitPullRequestIcon} size={14} />
            <Link className="shrink-0" href={url} rel="noreferrer" target="_blank">
                {number === null ? 'Pull request' : `PR #${number}`}
            </Link>
            {facts ? (
                <ActionCard.Meta>
                    {`· ${pullRequestStateLabels[facts.state]} · `}
                    {`${facts.changedFiles} ${facts.changedFiles === 1 ? 'file' : 'files'}`}
                    <span className="text-success"> +{facts.additions}</span>
                    <span className="text-danger"> −{facts.deletions}</span>
                </ActionCard.Meta>
            ) : null}
        </div>
    );
}

const pullRequestStateLabels = {
    closed: 'Closed',
    draft: 'Draft',
    merged: 'Merged',
    open: 'Open',
} as const;
