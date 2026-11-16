import { Description, Label, ListBox } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { EntityName } from '../../../components/ui/entity-name.tsx';
import { useClaimAssign } from '../../../hooks/servers/use-claim-assign.ts';
import { useClaimAssignees } from '../../../hooks/servers/use-claim-assignees.ts';
import type { HausInputs } from '../../../lib/haus-server.tsx';
import { claimAssignmentInput } from './claim-input.ts';

interface ClaimAssigneeTarget {
    assigneeAgentId: null | string;
    assigneeAvatarUrl: null | string;
    assigneeLabel: string;
    id: string;
    number: number;
    version: number;
}

const unassignedAssigneeKey = 'unassigned';

/**
 * Which Agent holds a claim. Claims are Agent work (ADR 0037): the picker lists
 * the Chat's Agents only, any member of the Chat may pick one, and assignment
 * only reserves — the Agent still takes the claim before starting.
 */
export function ClaimAssignee({
    claim,
    serverId,
}: {
    claim: ClaimAssigneeTarget;
    serverId: string;
}) {
    const [open, setOpen] = React.useState(false);
    const assignees = useClaimAssignees(serverId, claim.id, open);
    const assign = useClaimAssign();
    const value = claim.assigneeAgentId ?? unassignedAssigneeKey;
    const error = assignees.error ?? assign.error;

    return (
        <>
            <InlineSelect
                aria-label={`Assignee for claim #${claim.number}`}
                isDisabled={assign.isPending || (open && assignees.isPending)}
                onChange={(next) => {
                    const key = String(next);
                    if (key && key !== value) {
                        assign.mutate(
                            claimAssignmentInput(serverId, claim, claimAssigneeFromKey(key))
                        );
                    }
                }}
                onOpenChange={setOpen}
                value={value}
            >
                <InlineSelect.Trigger className="gap-1.5">
                    {claim.assigneeAgentId === null ? (
                        <span className="truncate text-sm">{claim.assigneeLabel}</span>
                    ) : (
                        <EntityName
                            avatarUrl={claim.assigneeAvatarUrl}
                            className="text-sm"
                            name={claim.assigneeLabel}
                            size={18}
                        />
                    )}
                    <InlineSelect.Indicator />
                </InlineSelect.Trigger>
                <InlineSelect.Popover className="w-64">
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
                                <EntityAvatar
                                    name={option.displayName}
                                    size={20}
                                    src={option.avatarUrl}
                                />
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
                </InlineSelect.Popover>
            </InlineSelect>
            {error ? (
                <span className="basis-full text-danger text-sm" role="alert">
                    {error.message}
                </span>
            ) : null}
        </>
    );
}

function claimAssigneeFromKey(key: string): HausInputs['claim']['assign']['assignee'] {
    return key === unassignedAssigneeKey ? null : { agentId: key };
}
