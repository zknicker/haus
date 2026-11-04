import { Label, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    CircleArrowUpRightIcon,
    CopyLinkIcon,
    Navigation03Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useClaimAssign } from '../../../hooks/servers/use-claim-assign.ts';
import { useClaimAssignees } from '../../../hooks/servers/use-claim-assignees.ts';
import { useClaimUpdate } from '../../../hooks/servers/use-claim-update.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { writeClipboardText } from '../../../lib/clipboard.ts';
import { useServerContext } from '../server-context.ts';
import { tasksRoute } from '../server-routes.ts';
import { claimAssigneeFromKey } from './claim-assignee.tsx';
import {
    ClaimAssigneeSubmenu,
    ClaimStatusSubmenu,
    claimAssigneeActionPrefix,
    claimStatusActionPrefix,
    TaskLabelSubmenu,
    TaskPrioritySubmenu,
    taskLabelActionPrefix,
    taskPriorityActionPrefix,
} from './claim-context-submenus.tsx';
import { claimAssignmentInput, claimUpdateInput, toggledTaskLabelIds } from './claim-input.ts';
import type { ClaimItem } from './claim-model.ts';
import { claimChatRoute } from './claim-thread-target.ts';

export function ClaimContextMenu({
    children,
    onOpenClaim,
    claim,
}: {
    children: React.ReactNode;
    onOpenClaim: (claim: ClaimItem) => void;
    claim: ClaimItem;
}) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const [open, setOpen] = React.useState(false);
    const assignees = useClaimAssignees(server.id, claim.id, open);
    const labels = useTaskLabels(server.id, { enabled: open });
    const assign = useClaimAssign();
    const update = useClaimUpdate();
    const pending = assign.isPending || update.isPending;

    const onAction = (key: React.Key) => {
        const action = String(key);
        if (action === 'open') {
            onOpenClaim(claim);
            return;
        }
        if (action === 'view-chat') {
            navigate(claimChatRoute(server.slug, claim));
            return;
        }
        if (action === 'copy-link') {
            const route = `${tasksRoute(server.slug)}?claim=${encodeURIComponent(claim.id)}`;
            writeClipboardText(new URL(route, window.location.origin).toString())
                .then(() => toast.success('Task link copied'))
                .catch(() => toast.danger('Could not copy the task link'));
            return;
        }
        if (action.startsWith(claimStatusActionPrefix)) {
            update.mutate(
                claimUpdateInput(server.id, claim, {
                    status: action.slice(claimStatusActionPrefix.length) as ClaimItem['status'],
                }),
                { onError: showClaimMutationError }
            );
            return;
        }
        if (action.startsWith(taskPriorityActionPrefix)) {
            update.mutate(
                claimUpdateInput(server.id, claim, {
                    priority: action.slice(
                        taskPriorityActionPrefix.length
                    ) as ClaimItem['priority'],
                }),
                { onError: showClaimMutationError }
            );
            return;
        }
        if (action.startsWith(claimAssigneeActionPrefix)) {
            assign.mutate(
                claimAssignmentInput(
                    server.id,
                    claim,
                    claimAssigneeFromKey(action.slice(claimAssigneeActionPrefix.length))
                ),
                { onError: showClaimMutationError }
            );
            return;
        }
        if (action.startsWith(taskLabelActionPrefix)) {
            const labelId = action.slice(taskLabelActionPrefix.length);
            const currentIds = claim.labels.map((label) => label.id);
            update.mutate(
                claimUpdateInput(server.id, claim, {
                    labelIds: toggledTaskLabelIds(
                        currentIds,
                        labelId,
                        !currentIds.includes(labelId)
                    ),
                }),
                { onError: showClaimMutationError }
            );
        }
    };

    return (
        <ContextMenu onOpenChange={setOpen} open={open}>
            <ContextMenu.Trigger className="block min-w-0">{children}</ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item id="open" textValue="Open task">
                        <Icon aria-hidden="true" icon={CircleArrowUpRightIcon} size={16} />
                        <Label>Open task</Label>
                    </ContextMenu.Item>
                    <ClaimStatusSubmenu claim={claim} disabled={pending} onAction={onAction} />
                    <TaskPrioritySubmenu claim={claim} disabled={pending} onAction={onAction} />
                    <ClaimAssigneeSubmenu
                        assignees={assignees.data ?? []}
                        claim={claim}
                        disabled={pending || assignees.isPending}
                        onAction={onAction}
                    />
                    <TaskLabelSubmenu
                        claim={claim}
                        disabled={pending || labels.isPending}
                        labels={labels.data ?? []}
                        onAction={onAction}
                    />
                    <ContextMenu.Separator />
                    <ContextMenu.Item id="view-chat" textValue="View in chat">
                        <Icon aria-hidden="true" icon={Navigation03Icon} size={16} />
                        <Label>View in chat</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="copy-link" textValue="Copy task link">
                        <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                        <Label>Copy task link</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function showClaimMutationError(error: { message: string }) {
    toast.danger('Task update failed', { description: error.message });
}
