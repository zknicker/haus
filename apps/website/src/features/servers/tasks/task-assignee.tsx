import type { TaskAssignee as TaskAssigneeOption } from '@haus/api';
import { Description, Label, ListBox, Select } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { EntityName } from '../../../components/ui/entity-name.tsx';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTaskAssign } from '../../../hooks/servers/use-task-assign.ts';
import { useTaskAssignees } from '../../../hooks/servers/use-task-assignees.ts';
import type { HausInputs } from '../../../lib/haus-server.tsx';
import { useServerContext } from '../server-context.ts';
import { taskAssignmentInput } from './task-input.ts';
import type { TaskItem } from './task-model.ts';

type TaskAssigneeTarget = Pick<
    TaskItem,
    | 'assigneeAgentId'
    | 'assigneeAvatarUrl'
    | 'assigneeLabel'
    | 'assigneeUserId'
    | 'id'
    | 'number'
    | 'version'
>;

export const unassignedAssigneeKey = 'unassigned';
const agentKeyPrefix = 'agent:';

/**
 * Who owns a task. Agents and people are offered together — a task is normally
 * handed to an Agent and completed by one — and assignment only reserves: the
 * assignee still claims the task before starting.
 */
export function TaskAssignee({
    presentation = 'boxed',
    task,
}: {
    /** `inline` drops the field box so the value reads as text. */
    presentation?: 'boxed' | 'inline';
    task: TaskAssigneeTarget;
}) {
    const { server } = useServerContext();
    const humans = useHumanDirectory(server.id);
    const [open, setOpen] = React.useState(false);
    const assignees = useTaskAssignees(server.id, task.id, open);
    const assign = useTaskAssign();
    const value = task.assigneeAgentId
        ? `${agentKeyPrefix}${task.assigneeAgentId}`
        : (task.assigneeUserId ?? unassignedAssigneeKey);
    const valueLabel = task.assigneeLabel;
    const isAssigned = Boolean(task.assigneeAgentId || task.assigneeUserId);

    const onChange = (next: unknown) => {
        const key = String(next);
        if (!key || key === value) {
            return;
        }
        assign.mutate(taskAssignmentInput(server.id, task, taskAssigneeFromKey(key)));
    };
    const options = (
        <ListBox>
            <ListBox.Item id={unassignedAssigneeKey} textValue="Unassigned">
                <Label>Unassigned</Label>
                <ListBox.ItemIndicator />
            </ListBox.Item>
            {(assignees.data ?? []).map((option) => (
                <ListBox.Item
                    id={taskAssigneeOptionKey(option)}
                    key={taskAssigneeOptionKey(option)}
                    textValue={taskAssigneeOptionName(option, humans)}
                >
                    <EntityAvatar
                        name={taskAssigneeOptionName(option, humans)}
                        size={20}
                        src={optionAvatarUrl(option, humans)}
                    />
                    {/* Name over role/handle: on one line a long name outran the
                        popover, because Label does not shrink its own content. */}
                    <div className="flex min-w-0 flex-col">
                        <Label className="truncate">{taskAssigneeOptionName(option, humans)}</Label>
                        <Description className="capitalize">
                            {option.kind === 'agent' ? `@${option.handle}` : option.role}
                        </Description>
                    </div>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
    const error = assignees.error ?? assign.error;
    const errorMessage = error ? (
        <span className="basis-full text-danger text-sm" role="alert">
            {error.message}
        </span>
    ) : null;
    const isBusy = assign.isPending || (open && assignees.isPending);

    if (presentation === 'inline') {
        return (
            <>
                <InlineSelect
                    aria-label={`Assignee for task #${task.number}`}
                    isDisabled={isBusy}
                    onChange={onChange}
                    onOpenChange={setOpen}
                    value={value}
                >
                    <InlineSelect.Trigger className="gap-1.5">
                        {isAssigned ? (
                            <EntityName
                                avatarUrl={task.assigneeAvatarUrl}
                                className="text-sm"
                                name={valueLabel}
                                size={18}
                            />
                        ) : (
                            <span className="truncate text-sm">{valueLabel}</span>
                        )}
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover className="w-64">{options}</InlineSelect.Popover>
                </InlineSelect>
                {errorMessage}
            </>
        );
    }

    return (
        <>
            <Select
                aria-label={`Assignee for task #${task.number}`}
                fullWidth
                isDisabled={isBusy}
                onChange={onChange}
                onOpenChange={setOpen}
                value={value}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value>
                        {isAssigned ? (
                            <EntityName avatarUrl={task.assigneeAvatarUrl} name={valueLabel} />
                        ) : (
                            valueLabel
                        )}
                    </Select.Value>
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>{options}</Select.Popover>
            </Select>
            {errorMessage}
        </>
    );
}

export function taskAssigneeFromKey(key: string): HausInputs['task']['assign']['assignee'] {
    if (key === unassignedAssigneeKey) {
        return null;
    }
    return key.startsWith(agentKeyPrefix)
        ? { agentId: key.slice(agentKeyPrefix.length), kind: 'agent' }
        : { kind: 'human', userId: key };
}

export function taskAssigneeOptionKey(option: TaskAssigneeOption): string {
    return option.kind === 'agent' ? `${agentKeyPrefix}${option.agentId}` : option.userId;
}

export function taskAssigneeOptionName(
    option: TaskAssigneeOption,
    humans: ReturnType<typeof useHumanDirectory>
): string {
    return option.kind === 'agent' ? option.displayName : humans.name(option.userId);
}

function optionAvatarUrl(
    option: TaskAssigneeOption,
    humans: ReturnType<typeof useHumanDirectory>
): null | string {
    return option.kind === 'agent' ? option.avatarUrl : humans.avatarUrl(option.userId);
}
