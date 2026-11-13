import type { TaskDetail } from '@haus/api';
import { Button, Calendar, DatePicker } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { parseDate } from '@internationalized/date';
import { Icon } from '../../components/ui/icon.tsx';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';
import { formatDueOn } from './task-facts.tsx';
import { showTaskUpdateError } from './task-update-error.ts';

/**
 * The display-only due date. A calendar and not a text field: a typed year
 * would save at every digit, and this date wakes nothing, so it has no need of
 * a keyboard's precision.
 */
export function TaskDuePicker({ task }: { task: TaskDetail }) {
    const update = useUpdateTask();
    const setDueOn = (dueOn: null | string) =>
        update.mutate(
            {
                expectedVersion: task.version,
                patch: { dueOn },
                serverId: task.serverId,
                taskId: task.id,
            },
            { onError: showTaskUpdateError }
        );

    return (
        <span className="flex min-w-0 items-center gap-1">
            <DatePicker
                aria-label="Due date"
                onChange={(value) => value && setDueOn(value.toString())}
                value={task.dueOn ? parseDate(task.dueOn) : null}
            >
                <DatePicker.Trigger>
                    <span className={task.dueOn ? 'text-sm' : 'text-muted text-sm'}>
                        {task.dueOn ? formatDueOn(task.dueOn) : 'No due date'}
                    </span>
                </DatePicker.Trigger>
                <DatePicker.Popover>
                    <Calendar aria-label="Due date">
                        <Calendar.Header>
                            <Calendar.Heading />
                            <Calendar.NavButton slot="previous" />
                            <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                            <Calendar.GridHeader>
                                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                            </Calendar.GridHeader>
                            <Calendar.GridBody>
                                {(date) => <Calendar.Cell date={date} />}
                            </Calendar.GridBody>
                        </Calendar.Grid>
                    </Calendar>
                </DatePicker.Popover>
            </DatePicker>
            {task.dueOn ? (
                <Button
                    aria-label="Clear due date"
                    isIconOnly
                    onPress={() => setDueOn(null)}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                </Button>
            ) : null}
        </span>
    );
}
