import { Button, Dropdown, Label, ListBox, Select } from '@heroui/react';
import type { Key } from 'react';
import { useClaimUpdate } from '../../../hooks/servers/use-claim-update.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { LabelChip } from '../../tasks/label-chip.tsx';
import {
    type TaskPriority,
    taskPriorityLabels,
    taskPriorityOrder,
} from '../../tasks/task-presentation.ts';
import { useServerContext } from '../server-context.ts';
import { claimUpdateInput } from './claim-input.ts';
import type { ClaimItem } from './claim-model.ts';
import { ClaimStatusSelect } from './claim-status-select.tsx';

export function ClaimMetadata({ claim }: { claim: ClaimItem }) {
    const { server } = useServerContext();
    const labelsQuery = useTaskLabels(server.id);
    const labels = labelsQuery.data ?? [];
    const update = useClaimUpdate();
    const selectedLabelIds = claim.labels.map((label) => label.id);

    return (
        <>
            <ClaimStatusSelect
                claim={claim}
                isDisabled={update.isPending}
                onStatusChange={(status) =>
                    update.mutate(claimUpdateInput(server.id, claim, { status }))
                }
            />
            <Select
                aria-label={`Priority for claim #${claim.number}`}
                isDisabled={update.isPending}
                onChange={(value) => {
                    const priority = value as TaskPriority;
                    if (priority && priority !== claim.priority) {
                        update.mutate(claimUpdateInput(server.id, claim, { priority }));
                    }
                }}
                value={claim.priority}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value>{taskPriorityLabels[claim.priority]}</Select.Value>
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {taskPriorityOrder.map((priority) => (
                            <ListBox.Item
                                id={priority}
                                key={priority}
                                textValue={taskPriorityLabels[priority]}
                            >
                                <Label>{taskPriorityLabels[priority]}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
            <Dropdown>
                <Button
                    aria-label={`Labels for claim #${claim.number}`}
                    isDisabled={update.isPending}
                    size="sm"
                    variant="secondary"
                >
                    Labels
                </Button>
                <Dropdown.Popover placement="bottom start">
                    {labels.length === 0 ? (
                        <p className="px-3 py-2 text-muted text-sm">No task labels yet.</p>
                    ) : (
                        <Dropdown.Menu
                            onSelectionChange={(keys) =>
                                update.mutate(
                                    claimUpdateInput(server.id, claim, {
                                        labelIds: selectedLabelIdsFrom(keys, labels),
                                    })
                                )
                            }
                            selectedKeys={selectedLabelIds}
                            selectionMode="multiple"
                        >
                            {labels.map((label) => (
                                <Dropdown.Item id={label.id} key={label.id} textValue={label.name}>
                                    <Label>
                                        <LabelChip color={label.color} name={label.name} />
                                    </Label>
                                    <Dropdown.ItemIndicator />
                                </Dropdown.Item>
                            ))}
                        </Dropdown.Menu>
                    )}
                </Dropdown.Popover>
            </Dropdown>
            {update.error ? (
                <span className="basis-full text-danger text-sm" role="alert">
                    {update.error.message}
                </span>
            ) : null}
        </>
    );
}

function selectedLabelIdsFrom(keys: 'all' | Set<Key>, labels: TaskLabel[]) {
    if (keys === 'all') {
        return labels.map((label) => label.id);
    }
    return [...keys].map(String);
}

type TaskLabel = NonNullable<ReturnType<typeof useTaskLabels>['data']>[number];
