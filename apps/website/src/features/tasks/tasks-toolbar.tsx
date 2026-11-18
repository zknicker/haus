import { Label, ListBox, Toolbar } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import type * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { useTaskKeys } from '../../hooks/tasks/use-task-keys.ts';
import { useServerContext } from '../servers/server-context.ts';
import { LabelDot } from './label-chip.tsx';
import { unassignedKey } from './task-assignee.ts';
import { PersonListBox } from './task-pickers.tsx';
import { taskStateLabels, taskStateOrder } from './task-state.ts';
import { TaskStateDisc } from './task-state-disc.tsx';
import type { TasksPageFilters } from './tasks-page-model.ts';
import { useTaskPeople } from './use-task-people.ts';

const any = 'any';

export function TasksToolbar({ filters }: { filters: TasksPageFilters }) {
    const setFilter = useSetFilter();
    return (
        <Toolbar aria-label="Task filters" className="flex flex-wrap items-center gap-3">
            <FilterSelect
                label="State"
                onChange={(next) => setFilter('state', next)}
                selected={filters.state ? taskStateLabels[filters.state] : 'Any'}
                value={filters.state}
            >
                <ListBox>
                    <AnyItem />
                    {taskStateOrder.map((state) => (
                        <ListBox.Item id={state} key={state} textValue={taskStateLabels[state]}>
                            <TaskStateDisc state={state} />
                            <Label>{taskStateLabels[state]}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </FilterSelect>
            <KeyFilter keyId={filters.keyId} onChange={(next) => setFilter('key', next)} />
            <AssigneeFilter
                assignee={filters.assignee}
                onChange={(next) => setFilter('assignee', next)}
            />
            <LabelFilter labelId={filters.labelId} onChange={(next) => setFilter('label', next)} />
        </Toolbar>
    );
}

function LabelFilter({
    labelId,
    onChange,
}: {
    labelId: null | string;
    onChange: (next: null | string) => void;
}) {
    const { server } = useServerContext();
    const labels = useTaskLabels(server.id).data ?? [];
    if (labels.length === 0 && labelId === null) {
        return null;
    }
    return (
        <FilterSelect
            label="Label"
            onChange={onChange}
            selected={labels.find((label) => label.id === labelId)?.name ?? 'Any'}
            value={labelId}
        >
            <ListBox>
                <AnyItem />
                {labels.map((label) => (
                    <ListBox.Item id={label.id} key={label.id} textValue={label.name}>
                        <LabelDot color={label.color} />
                        <Label>{label.name}</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </ListBox>
        </FilterSelect>
    );
}

function KeyFilter({
    keyId,
    onChange,
}: {
    keyId: null | string;
    onChange: (next: null | string) => void;
}) {
    const { server } = useServerContext();
    const keys = useTaskKeys(server.id).data ?? [];
    return (
        <FilterSelect
            label="Key"
            onChange={onChange}
            selected={keys.find((entry) => entry.id === keyId)?.key ?? 'Any'}
            value={keyId}
        >
            <ListBox>
                <AnyItem />
                {keys.map((entry) => (
                    <ListBox.Item id={entry.id} key={entry.id} textValue={entry.key}>
                        <Label>{entry.key}</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </ListBox>
        </FilterSelect>
    );
}

function AssigneeFilter({
    assignee,
    onChange,
}: {
    assignee: null | string;
    onChange: (next: null | string) => void;
}) {
    const { server } = useServerContext();
    const people = useTaskPeople(server.id);
    const selected =
        assignee === null
            ? 'Anyone'
            : assignee === unassignedKey
              ? 'Unassigned'
              : (people.find((person) => person.key === assignee)?.label ?? 'Anyone');
    return (
        <FilterSelect label="Assignee" onChange={onChange} selected={selected} value={assignee}>
            <PersonListBox
                leading={[
                    { id: any, label: 'Anyone' },
                    { id: unassignedKey, label: 'Unassigned' },
                ]}
                people={people}
            />
        </FilterSelect>
    );
}

function FilterSelect({
    children,
    label,
    onChange,
    selected,
    value,
}: {
    children: React.ReactNode;
    label: string;
    onChange: (next: null | string) => void;
    selected: string;
    value: null | string;
}) {
    return (
        <InlineSelect
            aria-label={`Filter by ${label.toLowerCase()}`}
            onChange={(next) => onChange(next === null || next === any ? null : String(next))}
            value={value ?? any}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <span className="text-muted text-sm">{label}</span>
                <span className="truncate text-sm">{selected}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                {children}
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function AnyItem() {
    return (
        <ListBox.Item id={any} textValue="Any">
            <Label>Any</Label>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}

function useSetFilter() {
    const [, setParams] = useSearchParams();
    return (name: 'assignee' | 'key' | 'label' | 'state', value: null | string) =>
        setParams(
            (params) => {
                const next = new URLSearchParams(params);
                if (value === null) {
                    next.delete(name);
                } else {
                    next.set(name, value);
                }
                return next;
            },
            { replace: true }
        );
}
