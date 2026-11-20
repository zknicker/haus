import type { Worker, WorkerTurnInput } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { PanelSection } from '../../tasks/work/panel-section.tsx';
import { PullRequestRows } from '../../tasks/work/pull-request-rows.tsx';
import { canFollowUpWorker, isWorkerTurnLive, workerCardLine } from '../worker-card-model.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { workerAgentFallbackName } from '../worker-presentation.ts';
import { WorkerConversation } from './worker-conversation.tsx';

export { WorkerBandMenu } from './worker-band-menu.tsx';

export function WorkerView({ workerId }: { workerId: string }) {
    const { server } = useServerContext();
    const record = useWorkerRecord(server.id, workerId);
    if (record.data) {
        return <WorkerThread work={record.data} />;
    }
    return record.error ? <WorkerUnavailable /> : null;
}

function WorkerThread({ work }: { work: Worker }) {
    const { server } = useServerContext();
    const task = useTask(server.id, work.taskId ? { taskId: work.taskId } : undefined).data;
    const name = useAuthorName(server.id);
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const line = isWorkerTurnLive(work) ? workerCardLine(work, { name, now }) : null;
    const pullRequests = work.pullRequest ? [work.pullRequest] : [];

    return (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8 lg:pe-5">
            <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <WorkerConversation
                        chatId={task?.chatId ?? `worker:${work.id}`}
                        liveLine={line?.text ?? null}
                        serverId={server.id}
                        work={work}
                    />
                </div>
                {task?.chatId && canFollowUpWorker(work) ? (
                    <div className="mx-auto w-full max-w-3xl">
                        <WorkerFollowUpComposer serverId={server.id} work={work} />
                    </div>
                ) : null}
            </div>
            {pullRequests.length > 0 ? (
                <aside
                    aria-label="Overview"
                    className="hidden min-h-0 flex-col gap-3 overflow-y-auto pt-4 pb-6 lg:flex"
                >
                    <PanelSection count={pullRequests.length} title="Pull requests">
                        <PullRequestRows readings={pullRequests} />
                    </PanelSection>
                </aside>
            ) : null}
        </div>
    );
}

function useAuthorName(serverId: string) {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    return (author: WorkerTurnInput['author']) =>
        author.kind === 'agent'
            ? (agents.find((agent) => agent.id === author.id)?.displayName ??
              workerAgentFallbackName(author.id))
            : humans.name(author.id);
}

function WorkerUnavailable() {
    return (
        <EmptyState className="flex-1">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={Alert02Icon} />
                </EmptyState.Media>
                <EmptyState.Title>Worker not found</EmptyState.Title>
            </EmptyState.Header>
        </EmptyState>
    );
}
