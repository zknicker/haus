import type { TaskDetail } from '@haus/api';
import { WorkerRows } from '../../workers/worker-rows.tsx';
import { TaskPullRequestCard } from './task-pull-request-card.tsx';
import { pendingTaskReminders, reminderLine, standalonePullRequests } from './task-work-model.ts';

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
            {task.attachedWork.length > 0 ? (
                <section aria-label="Workers" className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-muted px-2 text-xs font-medium">
                        Workers <span className="tabular-nums">{task.attachedWork.length}</span>
                    </h3>
                    <WorkerRows label="Workers" works={task.attachedWork} />
                </section>
            ) : null}
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
