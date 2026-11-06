import { type ColumnCategory, columnCategories } from '@haus/api';
import { Button, Input, Label, ListBox, Select, TextField, Tooltip } from '@heroui/react';
import { ItemCardGroup, ListView } from '@heroui-pro/react';
import { Plus } from '@hugeicons/core-free-icons';
import { Cancel01Icon, DragDropVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useDragAndDrop } from 'react-aria-components';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type ColumnDraft,
    type ColumnRemoval,
    isLastOfRequiredCategory,
    reorderColumnDrafts,
} from './board-column-plan.ts';
import { ColumnCategoryDisc, columnCategoryLabels } from './column-category-disc.tsx';

/**
 * The ordered column list: drag to reorder, a name and category per row, and a
 * remove that locks on the last column of a required category. Removing a
 * column that holds Tasks asks where they go, in a row of its own under the
 * list, and the draft stays unsaveable until it knows.
 */
export function BoardColumnEditor({
    drafts,
    onDraftsChange,
    onRemovalsChange,
    removals,
    taskCounts,
}: {
    drafts: ColumnDraft[];
    onDraftsChange: (drafts: ColumnDraft[]) => void;
    onRemovalsChange: (removals: ColumnRemoval[]) => void;
    removals: ColumnRemoval[];
    taskCounts: ReadonlyMap<string, number>;
}) {
    const { dragAndDropHooks } = useDragAndDrop({
        getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
        onReorder: ({ keys, target }) => {
            const [moved] = [...keys];
            if (moved !== undefined && target.dropPosition !== 'on') {
                onDraftsChange(
                    reorderColumnDrafts(
                        drafts,
                        String(moved),
                        String(target.key),
                        target.dropPosition
                    )
                );
            }
        },
    });
    const patch = (id: string, change: Partial<ColumnDraft>) =>
        onDraftsChange(drafts.map((draft) => (draft.id === id ? { ...draft, ...change } : draft)));
    const remove = (draft: ColumnDraft) => {
        onDraftsChange(drafts.filter((candidate) => candidate.id !== draft.id));
        if (draft.savedId) {
            onRemovalsChange([
                ...removals,
                {
                    id: draft.savedId,
                    name: draft.name,
                    targetId: null,
                    taskCount: taskCounts.get(draft.savedId) ?? 0,
                },
            ]);
        }
    };

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>Columns</ItemCardGroup.Title>
                <Button
                    onPress={() =>
                        onDraftsChange([
                            ...drafts,
                            { category: 'todo', id: crypto.randomUUID(), name: '' },
                        ])
                    }
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Plus} size={16} />
                    Add column
                </Button>
            </ItemCardGroup.Header>
            <ListView
                aria-label="Columns"
                // Rows cache by item, and each closes over the whole draft list.
                dependencies={[drafts, removals, taskCounts]}
                disallowTypeAhead
                dragAndDropHooks={dragAndDropHooks}
                items={drafts}
                keyboardNavigationBehavior="tab"
                variant="secondary"
            >
                {(draft) => {
                    const locked = isLastOfRequiredCategory(drafts, draft);
                    return (
                        <ListView.Item id={draft.id} textValue={draft.name || 'New column'}>
                            <ListView.ItemContent>
                                <Button
                                    aria-label={`Reorder ${draft.name || 'new column'}`}
                                    isIconOnly
                                    size="sm"
                                    slot="drag"
                                    variant="ghost"
                                >
                                    <Icon
                                        aria-hidden="true"
                                        icon={DragDropVerticalIcon}
                                        size={16}
                                    />
                                </Button>
                                <TextField
                                    aria-label="Column name"
                                    className="min-w-0 flex-1"
                                    onChange={(name) => patch(draft.id, { name })}
                                    value={draft.name}
                                    variant="secondary"
                                >
                                    <Input />
                                </TextField>
                                <CategorySelect
                                    category={draft.category}
                                    isLocked={locked}
                                    name={draft.name}
                                    onChange={(category) => patch(draft.id, { category })}
                                />
                                <RemoveColumnButton
                                    isLocked={locked}
                                    name={draft.name}
                                    onRemove={() => remove(draft)}
                                />
                            </ListView.ItemContent>
                        </ListView.Item>
                    );
                }}
            </ListView>
            {removals
                .filter((removal) => removal.taskCount > 0)
                .map((removal) => (
                    <ColumnRemovalRow
                        drafts={drafts}
                        key={removal.id}
                        onTargetChange={(targetId) =>
                            onRemovalsChange(
                                removals.map((entry) =>
                                    entry.id === removal.id ? { ...entry, targetId } : entry
                                )
                            )
                        }
                        removal={removal}
                    />
                ))}
        </ItemCardGroup>
    );
}

function CategorySelect({
    category,
    isLocked,
    name,
    onChange,
}: {
    category: ColumnCategory;
    isLocked: boolean;
    name: string;
    onChange: (category: ColumnCategory) => void;
}) {
    return (
        <Select
            aria-label={`Category for ${name || 'new column'}`}
            className="w-36 shrink-0"
            isDisabled={isLocked}
            onChange={(next) => onChange(next as ColumnCategory)}
            value={category}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value>{columnCategoryLabels[category]}</Select.Value>
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    {columnCategories.map((option) => (
                        <ListBox.Item
                            id={option}
                            key={option}
                            textValue={columnCategoryLabels[option]}
                        >
                            <ColumnCategoryDisc category={option} />
                            <Label>{columnCategoryLabels[option]}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

function RemoveColumnButton({
    isLocked,
    name,
    onRemove,
}: {
    isLocked: boolean;
    name: string;
    onRemove: () => void;
}) {
    const button = (
        <Button
            aria-label={`Remove ${name || 'new column'}`}
            isDisabled={isLocked}
            isIconOnly
            onPress={onRemove}
            size="sm"
            variant="ghost"
        >
            <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
        </Button>
    );
    if (!isLocked) {
        return button;
    }
    return (
        <Tooltip delay={0}>
            <span>{button}</span>
            <Tooltip.Content>A board keeps one Todo, Active, and Done column.</Tooltip.Content>
        </Tooltip>
    );
}

/** A removed column still holding Tasks. Only a saved column can take them: a new one has no id yet. */
function ColumnRemovalRow({
    drafts,
    onTargetChange,
    removal,
}: {
    drafts: readonly ColumnDraft[];
    onTargetChange: (targetId: string) => void;
    removal: ColumnRemoval;
}) {
    const targets = drafts.filter((draft) => draft.savedId);
    const selected = targets.find((draft) => draft.savedId === removal.targetId);
    const noun = removal.taskCount === 1 ? 'Task' : 'Tasks';

    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 text-sm">
                {`${removal.name} holds ${removal.taskCount} ${noun}. Move to`}
            </span>
            <Select
                aria-label={`Move Tasks from ${removal.name}`}
                className="w-44 shrink-0"
                onChange={(next) => next && onTargetChange(String(next))}
                value={removal.targetId}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value>{selected?.name ?? 'Choose a column'}</Select.Value>
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {targets.map((draft) => (
                            <ListBox.Item id={draft.savedId} key={draft.id} textValue={draft.name}>
                                <Label>{draft.name}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
        </div>
    );
}
