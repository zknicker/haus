import type { Worker } from '@haus/api';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { WorkerComposerDock } from '../question/worker-composer-dock.tsx';
import { WorkerConversation } from '../view/worker-conversation.tsx';
import { isWorkerTurnLive, workerCardLine } from '../worker-card-model.ts';
import { useWorkerAuthorName } from './use-worker-author-name.ts';

export function WorkerSession({ work }: { work: Worker }) {
    const { server } = useServerContext();
    const task = useTask(server.id, work.taskId ? { taskId: work.taskId } : undefined).data;
    const name = useWorkerAuthorName(server.id);
    const live = isWorkerTurnLive(work);
    const now = useRelativeNow(live ? 5000 : 60_000);
    const line = live ? workerCardLine(work, { name, now }) : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="worker-session">
            <div className="min-h-0 flex-1 overflow-y-auto">
                <WorkerConversation
                    chatId={task?.chatId ?? `worker:${work.id}`}
                    liveLine={line?.text ?? null}
                    serverId={server.id}
                    work={work}
                />
            </div>
            {task?.chatId ? (
                <div className="mx-auto w-full max-w-3xl">
                    <WorkerComposerDock serverId={server.id} work={work} />
                </div>
            ) : null}
        </div>
    );
}
