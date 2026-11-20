import type { PullRequestReading, Worker, WorkerBranch, WorkerTurnInput } from '@haus/api';
import { Chip, Link, toast } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useParams } from 'react-router-dom';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { openExternalLink } from '../../lib/open-external-link.ts';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useWorkerAgentName } from './use-worker-agent-name.ts';
import {
    canFollowUpWorker,
    isWorkerTurnLive,
    newestWorkerReport,
    workerCardLine,
    workerStatusChipColors,
    workerStatusDiscStates,
    workerStatusText,
} from './worker-card-model.ts';
import { WorkerFollowUpComposer } from './worker-follow-up-composer.tsx';
import { WorkerPlace } from './worker-place.tsx';
import { workerBranch, workerBranchPullRequestNumber } from './worker-presentation.ts';
import { WorkerReport } from './worker-report.tsx';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

export function WorkerCard({ chatId = null, work }: { chatId?: null | string; work: Worker }) {
    const { slug = '' } = useParams();
    const server = useServer(slug, Boolean(slug)).data;
    const agentName = useWorkerAgentName(work);
    const humans = useHumanDirectory(server?.id);
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const report = newestWorkerReport(work);
    const name = (author: WorkerTurnInput['author']) =>
        author.kind === 'agent' ? agentName : humans.name(author.id);
    const line = workerCardLine(work, { name, now });
    const branch = workerBranch(work);

    return (
        <ActionCard
            actionKind="worker"
            actionStatus={work.status}
            aria-label={`Worker: ${work.title}`}
            data-testid="worker-card"
        >
            <ActionCard.Header>
                <ActionCard.Mark>
                    <WorkerKeycap
                        environmentName={work.environmentName}
                        provider={work.place}
                        size={40}
                    />
                </ActionCard.Mark>
                <ActionCard.Content>
                    <ActionCard.Title>
                        {work.title}
                        <ActionCard.Status>
                            <Chip
                                color={workerStatusChipColors[work.status]}
                                size="sm"
                                variant="soft"
                            >
                                <WorkerStatusDisc
                                    className="size-3 text-current"
                                    state={workerStatusDiscStates[work.status]}
                                />
                                <Chip.Label>{workerStatusText(work)}</Chip.Label>
                            </Chip>
                        </ActionCard.Status>
                    </ActionCard.Title>
                    <ActionCard.Description>
                        <WorkerPlace work={work} />
                        {` · ${work.repository}`}
                    </ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            <WorkerPullRequestRow branch={branch} reading={work.pullRequest} />
            {report && server ? (
                <WorkerReport chatId={chatId} report={report} server={server} />
            ) : null}
            {line ? (
                <ActionCard.Meta data-testid="worker-status-line" tone={line.tone}>
                    {line.text}
                </ActionCard.Meta>
            ) : null}
            {server && canFollowUpWorker(work) ? (
                <WorkerFollowUpComposer serverId={server.id} work={work} />
            ) : null}
        </ActionCard>
    );
}

export function WorkerPullRequestRow({
    branch,
    reading = null,
}: {
    branch: null | WorkerBranch;
    reading?: null | PullRequestReading;
}) {
    const url = reading?.url ?? branch?.pullRequestUrl ?? null;
    const number = reading?.number ?? (branch ? workerBranchPullRequestNumber(branch) : null);
    const facts = reading ?? branch?.pullRequest ?? null;
    if (url === null || number === null) {
        return null;
    }
    return (
        <ActionCard.Meta data-testid="worker-pull-request">
            <Icon aria-hidden="true" icon={GitPullRequestIcon} />
            <Link onPress={() => openPullRequest(url)}>{`PR #${number}`}</Link>
            {facts ? (
                <>
                    {` · ${pullRequestStateLabels[facts.state]} · `}
                    {`${facts.changedFiles} ${facts.changedFiles === 1 ? 'file' : 'files'}`}
                    <span className="text-success"> +{facts.additions}</span>
                    <span className="text-danger"> −{facts.deletions}</span>
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

function openPullRequest(url: string) {
    openExternalLink(url).catch(() => toast.danger('Could not open the pull request'));
}
