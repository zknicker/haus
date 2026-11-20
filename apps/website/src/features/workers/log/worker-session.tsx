import type { Worker } from '@haus/api';
import { Spinner } from '@heroui/react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { canFollowUpWorker, isWorkerTurnLive, workerCardLine } from '../worker-card-model.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { useWorkerAuthorName } from './use-worker-author-name.ts';
import { WorkerLogTurn } from './worker-log-turn.tsx';

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
                <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 px-5 py-4">
                    {[...work.turns].reverse().map((turn) => (
                        <WorkerLogTurn
                            chatId={task?.chatId ?? null}
                            key={turn.turnId}
                            name={name}
                            server={server}
                            turn={turn}
                        />
                    ))}
                    {line ? (
                        <p
                            className={
                                line.tone === 'muted'
                                    ? 'text-muted flex items-center gap-2 text-sm'
                                    : 'text-warning flex items-center gap-2 text-sm'
                            }
                            data-testid="worker-live-line"
                        >
                            <Spinner color="current" size="sm" />
                            {line.text}
                        </p>
                    ) : null}
                </div>
            </div>
            {task?.chatId && canFollowUpWorker(work) ? (
                <div className="mx-auto w-full max-w-3xl">
                    <WorkerFollowUpComposer serverId={server.id} work={work} />
                </div>
            ) : null}
        </div>
    );
}
