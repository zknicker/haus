import type { TaskDetail } from '@haus/api';
import { CloudAgentWorkCard } from '../../cloud-agents/cloud-agent-work-card.tsx';
import { CloudAgentRunSummary } from './cloud-agent-run-summary.tsx';
import { TaskPullRequestCard } from './task-pull-request-card.tsx';
import { pendingTaskReminders, reminderLine, standalonePullRequests } from './task-work-model.ts';

/**
 * The Task's attached work beside its conversation (ADR 0053 decision 12):
 * one card per Cloud Agent, each with its newest Run's summary, then each
 * attached pull request no card already names, then the pending one-time
 * reminders as quiet lines. Nothing at all while nothing is attached; the
 * cards carry their own edges.
 */
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
                <div data-work-id={work.id} key={work.id}>
                    <CloudAgentWorkCard work={work}>
                        <CloudAgentRunSummary work={work} />
                    </CloudAgentWorkCard>
                </div>
            ))}
            {pullRequests.map((reading) => (
                <TaskPullRequestCard key={reading.url} reading={reading} />
            ))}
            {reminders.length > 0 ? (
                <ul aria-label="Reminders" className="flex flex-col gap-1 pt-1 text-muted text-sm">
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
