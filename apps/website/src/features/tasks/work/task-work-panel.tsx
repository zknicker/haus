import type { TaskDetail } from '@haus/api';
import { PanelSection } from './panel-section.tsx';
import { PullRequestRows } from './pull-request-rows.tsx';
import { pendingTaskReminders, reminderLine } from './task-work-model.ts';

export function TaskWorkPanel({ task }: { task: Pick<TaskDetail, 'pullRequests' | 'reminders'> }) {
    const reminders = pendingTaskReminders(task.reminders);
    if (task.pullRequests.length === 0 && reminders.length === 0) {
        return null;
    }

    return (
        <aside aria-label="Attached work" className="task-work flex min-w-0 flex-col gap-3">
            {task.pullRequests.length > 0 ? (
                <PanelSection count={task.pullRequests.length} title="Pull requests">
                    <PullRequestRows readings={task.pullRequests} />
                </PanelSection>
            ) : null}
            {reminders.length > 0 ? (
                <ul
                    aria-label="Reminders"
                    className="text-muted flex flex-col gap-1 px-3 pt-1 text-sm"
                >
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
