import { Button, Label, ListBox, Toolbar } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { useServerContext } from '../servers/server-context.ts';
import { unassignedKey } from './board-view.ts';
import { LabelDot } from './label-chip.tsx';
import { PersonListBox } from './task-pickers.tsx';
import { useBoardView } from './use-board-view.ts';
import { useTaskPeople } from './use-task-people.ts';

const anyone = 'any';
const anyLabel = 'any';

/**
 * What the board is narrowed to, its one-line state, and the fold over canceled
 * work. Filters live over the content they narrow, in the URL.
 */
export function BoardToolbar({
    canceled,
    done,
    onToggleCanceled,
    open,
    showCanceled,
}: {
    canceled: number;
    done: number;
    onToggleCanceled: () => void;
    open: number;
    showCanceled: boolean;
}) {
    return (
        <Toolbar aria-label="Board filters" className="flex items-center gap-3 px-4 py-2">
            <AssigneeFilter />
            <LabelFilter />
            <span className="text-muted text-sm tabular-nums">{`${open} open · ${done} done`}</span>
            {canceled > 0 ? (
                <Button className="ms-auto" onPress={onToggleCanceled} size="sm" variant="ghost">
                    {showCanceled ? 'Hide canceled' : `Canceled · ${canceled}`}
                </Button>
            ) : null}
        </Toolbar>
    );
}

function AssigneeFilter() {
    const { server } = useServerContext();
    const { filters, setAssignee } = useBoardView();
    const people = useTaskPeople(server.id);
    const value = filters.assignee ?? anyone;
    const selected =
        value === unassignedKey
            ? 'Unassigned'
            : (people.find((person) => person.key === value)?.label ?? 'Anyone');

    return (
        <InlineSelect
            aria-label="Filter by assignee"
            onChange={(next) => setAssignee(next === anyone ? null : String(next))}
            value={value}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <span className="text-muted text-sm">Assignee</span>
                <span className="truncate text-sm">{selected}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <PersonListBox
                    leading={[
                        { id: anyone, label: 'Anyone' },
                        { id: unassignedKey, label: 'Unassigned' },
                    ]}
                    people={people}
                />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function LabelFilter() {
    const { server } = useServerContext();
    const { filters, setLabelId } = useBoardView();
    const labels = useTaskLabels(server.id).data ?? [];
    if (labels.length === 0) {
        return null;
    }
    const value = filters.labelId ?? anyLabel;

    return (
        <InlineSelect
            aria-label="Filter by label"
            onChange={(next) => setLabelId(next === anyLabel ? null : String(next))}
            value={value}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <span className="text-muted text-sm">Label</span>
                <span className="truncate text-sm">
                    {labels.find((label) => label.id === value)?.name ?? 'Any'}
                </span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ListBox>
                    <ListBox.Item id={anyLabel} textValue="Any">
                        <Label>Any</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
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
