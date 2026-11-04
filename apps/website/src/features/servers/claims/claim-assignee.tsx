import { Description, Label, ListBox, Select } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { EntityName } from '../../../components/ui/entity-name.tsx';
import { useClaimAssign } from '../../../hooks/servers/use-claim-assign.ts';
import { useClaimAssignees } from '../../../hooks/servers/use-claim-assignees.ts';
import type { HausInputs } from '../../../lib/haus-server.tsx';
import { claimAssignmentInput } from './claim-input.ts';
import type { ClaimItem } from './claim-model.ts';

type ClaimAssigneeTarget = Pick<
    ClaimItem,
    'assigneeAgentId' | 'assigneeAvatarUrl' | 'assigneeLabel' | 'id' | 'number' | 'version'
>;

export const unassignedAssigneeKey = 'unassigned';

/**
 * Which Agent holds a claim. Claims are Agent work (ADR 0037): the picker lists
 * the Chat's Agents only, any member of the Chat may pick one, and assignment
 * only reserves — the Agent still takes the claim before starting.
 */
export function ClaimAssignee({
    presentation = 'boxed',
    claim,
    serverId,
}: {
    /** `inline` drops the field box so the value reads as text. */
    presentation?: 'boxed' | 'inline';
    claim: ClaimAssigneeTarget;
    serverId: string;
}) {
    const [open, setOpen] = React.useState(false);
    const assignees = useClaimAssignees(serverId, claim.id, open);
    const assign = useClaimAssign();
    const value = claim.assigneeAgentId ?? unassignedAssigneeKey;
    const valueLabel = claim.assigneeLabel;
    const isAssigned = claim.assigneeAgentId !== null;

    const onChange = (next: unknown) => {
        const key = String(next);
        if (!key || key === value) {
            return;
        }
        assign.mutate(claimAssignmentInput(serverId, claim, claimAssigneeFromKey(key)));
    };
    const options = (
        <ListBox>
            <ListBox.Item id={unassignedAssigneeKey} textValue="Unassigned">
                <Label>Unassigned</Label>
                <ListBox.ItemIndicator />
            </ListBox.Item>
            {(assignees.data ?? []).map((option) => (
                <ListBox.Item
                    id={option.agentId}
                    key={option.agentId}
                    textValue={option.displayName}
                >
                    <EntityAvatar name={option.displayName} size={20} src={option.avatarUrl} />
                    {/* Name over handle: on one line a long name outran the
                        popover, because Label does not shrink its own content. */}
                    <div className="flex min-w-0 flex-col">
                        <Label className="truncate">{option.displayName}</Label>
                        <Description>{`@${option.handle}`}</Description>
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
                    aria-label={`Assignee for claim #${claim.number}`}
                    isDisabled={isBusy}
                    onChange={onChange}
                    onOpenChange={setOpen}
                    value={value}
                >
                    <InlineSelect.Trigger className="gap-1.5">
                        {isAssigned ? (
                            <EntityName
                                avatarUrl={claim.assigneeAvatarUrl}
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
                aria-label={`Assignee for claim #${claim.number}`}
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
                            <EntityName avatarUrl={claim.assigneeAvatarUrl} name={valueLabel} />
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

export function claimAssigneeFromKey(key: string): HausInputs['claim']['assign']['assignee'] {
    return key === unassignedAssigneeKey ? null : { agentId: key };
}
