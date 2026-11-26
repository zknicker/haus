import type { Task } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { TaskActivityChip } from './task-activity.tsx';
import { TaskRowMenu } from './task-row-menu.tsx';
import { taskAge } from './tasks-page-model.ts';
import { useOpenTask } from './use-open-task.ts';
import { useMachineLabels, useModelLabels, useTaskIssueCodes } from './use-task-facts.ts';

export function TaskListRows({ label, tasks }: { label: string; tasks: readonly Task[] }) {
    const { server } = useServerContext();
    const openTask = useOpenTask();
    const now = useRelativeNow(60_000);
    const machines = useMachineLabels(server.id);
    const models = useModelLabels(server.id);
    const issueCodes = useTaskIssueCodes(server.id);
    return (
        <ListView
            aria-label={label}
            className="task-list"
            onAction={(key) => {
                const task = tasks.find((candidate) => candidate.id === key);
                if (task) {
                    openTask(task);
                }
            }}
            variant="secondary"
        >
            {tasks.map((task) => (
                <TaskListRow
                    issueCode={issueCodes.get(task.id) ?? null}
                    key={task.id}
                    machine={task.computerId ? (machines.get(task.computerId) ?? null) : null}
                    model={task.model ? (models.get(task.model) ?? task.model) : null}
                    now={now}
                    task={task}
                />
            ))}
        </ListView>
    );
}

function TaskListRow({
    issueCode,
    machine,
    model,
    now,
    task,
}: {
    issueCode: null | string;
    machine: null | string;
    model: null | string;
    now: number;
    task: Task;
}) {
    const session = [machine, model].filter(Boolean).join(' · ');
    return (
        <ListView.Item id={task.id} textValue={task.title}>
            <ListView.ItemContent>
                {issueCode ? <span className="task-list__key">{issueCode}</span> : null}
                <ListView.Title className="min-w-0">{task.title}</ListView.Title>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="task-list__facts">
                    {session ? <span className="task-list__session">{session}</span> : null}
                    <TaskActivityChip task={task} />
                    <span
                        className="task-list__age"
                        title={`Created ${createdFormat.format(new Date(task.createdAt))}`}
                    >
                        {taskAge(task, now)}
                    </span>
                    <span className="task-list__menu">
                        <TaskRowMenu task={task} />
                    </span>
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}

const createdFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
});
