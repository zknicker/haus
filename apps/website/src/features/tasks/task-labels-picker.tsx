import type { TaskDetail } from '@haus/api';
import { Label, ListBox } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import type * as React from 'react';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';
import { LabelDot } from './label-chip.tsx';
import { TaskLabelChips } from './task-facts.tsx';
import { showTaskUpdateError } from './task-update-error.ts';

/** The Task's labels, read as chips; the same press opens the catalog to change them. */
export function TaskLabelsPicker({ task }: { task: TaskDetail }) {
    const labels = useTaskLabels(task.serverId).data ?? [];
    const update = useUpdateTask();

    return (
        <InlineSelect
            aria-label="Labels"
            isDisabled={labels.length === 0}
            onChange={(keys) =>
                update.mutate(
                    {
                        expectedVersion: task.version,
                        patch: { labelIds: (keys as React.Key[]).map(String) },
                        serverId: task.serverId,
                        taskId: task.id,
                    },
                    { onError: showTaskUpdateError }
                )
            }
            selectionMode="multiple"
            value={task.labelIds}
        >
            <InlineSelect.Trigger className="h-auto gap-1.5">
                {task.labelIds.length > 0 ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                        <TaskLabelChips labelIds={task.labelIds} />
                    </span>
                ) : (
                    <span className="truncate text-muted text-sm">
                        {labels.length === 0 ? 'No labels yet' : 'Add labels'}
                    </span>
                )}
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ListBox selectionMode="multiple">
                    {labels.map((label) => (
                        <ListBox.Item id={label.id} key={label.id} textValue={label.name}>
                            <LabelDot color={label.color} />
                            <Label>{label.name}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
