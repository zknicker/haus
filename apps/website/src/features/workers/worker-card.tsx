import {
    type PullRequestReading,
    type Worker,
    type WorkerBranch,
    type WorkerTurnInput,
    workerPullRequestNumber,
} from '@haus/api';
import { Chip, Link } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useParams } from 'react-router-dom';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useTranscriptRenderContextOptional } from '../chats/chat-transcript-render-context.tsx';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import {
    canFollowUpWorker,
    isWorkerTurnLive,
    newestWorkerReport,
    workerCardLine,
    workerStatusChipColors,
    workerStatusDiscStates,
    workerStatusText,
} from './worker-card-model.ts';
import { WorkerCopyLink } from './worker-copy-link.tsx';
import { WorkerFollowUpComposer } from './worker-follow-up-composer.tsx';
import { WorkerPlace } from './worker-place.tsx';
import {
    workerAgentFallbackName,
    workerBranch,
    workerBranchPullRequestNumber,
} from './worker-presentation.ts';
import { WorkerReport } from './worker-report.tsx';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

export function WorkerCard({ chatId: chatIdProp, work }: { chatId?: null | string; work: Worker }) {
    const transcriptChatId = useTranscriptRenderContextOptional()?.chatId ?? null;
    const chatId = chatIdProp === undefined ? transcriptChatId : chatIdProp;
    const { slug = '' } = useParams();
    const server = useServer(slug, Boolean(slug)).data;
    const agents = useAgentAppearances(server?.id);
    const humans = useHumanDirectory(server?.id);
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const report = newestWorkerReport(work);
    const name = (author: WorkerTurnInput['author']) =>
        author.kind === 'agent'
            ? (agents.find((agent) => agent.id === author.id)?.displayName ??
              workerAgentFallbackName(author.id))
            : humans.name(author.id);
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
                    <div className="text-muted flex min-w-0 items-center gap-1 text-sm leading-5">
                        <WorkerPlace work={work} />
                        <ActionCard.Description>{`· ${work.repository}`}</ActionCard.Description>
                    </div>
                </ActionCard.Content>
            </ActionCard.Header>
            <WorkerPullRequestRow
                branch={branch}
                reading={work.pullRequest}
                reportUrls={report?.pullRequestUrls}
            />
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
            {server && work.taskId === null && chatId ? (
                <ActionCard.Actions>
                    <WorkerCopyLink chatId={chatId} slug={server.slug} />
                </ActionCard.Actions>
            ) : null}
        </ActionCard>
    );
}

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
