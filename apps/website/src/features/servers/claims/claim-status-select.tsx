import { Label, ListBox } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import {
    type ClaimStatus,
    claimStatusLabels,
    claimStatusOrder,
} from '../../claims/claim-presentation.ts';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';

export interface ClaimStatusTarget {
    id: string;
    number: number;
    status: ClaimStatus;
    version: number;
}

/** A claim's status, inline so the value reads as text beside the Thread's other facts. */
export function ClaimStatusSelect({
    error,
    isDisabled,
    onStatusChange,
    claim,
}: {
    error?: { message: string } | null;
    isDisabled: boolean;
    onStatusChange: (status: ClaimStatus) => void;
    claim: ClaimStatusTarget;
}) {
    return (
        <>
            <InlineSelect
                aria-label={`Status for claim #${claim.number}`}
                isDisabled={isDisabled}
                onChange={(value) => {
                    const status = value as ClaimStatus;
                    if (status && status !== claim.status) {
                        onStatusChange(status);
                    }
                }}
                value={claim.status}
            >
                <InlineSelect.Trigger className="gap-1.5">
                    <TaskStatusDisc className="size-3.5" status={claim.status} />
                    <span className="truncate text-sm">{claimStatusLabels[claim.status]}</span>
                    <InlineSelect.Indicator />
                </InlineSelect.Trigger>
                <InlineSelect.Popover className="w-44">
                    <ListBox>
                        {claimStatusOrder.map((status) => (
                            <ListBox.Item
                                id={status}
                                key={status}
                                textValue={claimStatusLabels[status]}
                            >
                                <TaskStatusDisc className="size-[14px]" status={status} />
                                <Label>{claimStatusLabels[status]}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </InlineSelect.Popover>
            </InlineSelect>
            {error ? (
                <span className="text-danger text-sm" role="alert">
                    {error.message}
                </span>
            ) : null}
        </>
    );
}
