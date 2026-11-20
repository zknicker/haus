import type { TaskDetail } from '@haus/api';
import { WorkerCard } from '../../workers/worker-card.tsx';
import { TaskPullRequestCard } from './task-pull-request-card.tsx';
import { pendingTaskReminders, reminderLine, standalonePullRequests } from './task-work-model.ts';
import { WorkerTurnSummary } from './worker-turn-summary.tsx';

export function TaskWorkPanel({
    task,
}: {
    task: Pick<TaskDetail, 'attachedWork' | 'pullRequests' | 'reminders'>;
}) {
    const pullRequests = standalonePullRequests(task.attachedWork, task.pullRequests);
    const reminders = pendingTaskReminders(task.reminders);
    if (task.attachedWork.length === 0 && pullRequests.length === 0 && reminders.length === 0) {
        return null;
    }

    return (
        <aside aria-label="Attached work" className="flex min-w-0 flex-col gap-3">
            {task.attachedWork.map((work) => (
                <div className="scroll-my-4" data-work-id={work.id} key={work.id} tabIndex={-1}>
                    <WorkerCard work={work}>
                        <WorkerTurnSummary work={work} />
                    </WorkerCard>
                </div>
            ))}
            {pullRequests.map((reading) => (
                <TaskPullRequestCard key={reading.url} reading={reading} />
            ))}
            {reminders.length > 0 ? (
                <ul aria-label="Reminders" className="text-muted flex flex-col gap-1 pt-1 text-sm">
                    {reminders.map((reminder) => (
                        <li key={reminder.reminderId} title={reminder.title}>
                            {reminderLine(reminder.setBy.displayName, reminder.nextFireAt)}
                        </li>
                    ))}
                </ul>
            ) : null}
        </aside>
    );
}
