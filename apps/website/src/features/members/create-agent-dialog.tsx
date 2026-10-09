import * as React from 'react';
import { useAgentCreate } from '../../hooks/members/use-agent-create.ts';
import { AgentCreationDialog } from './agent-creation-dialog.tsx';
import type { AgentCreationSubmitValues } from './agent-creation-form.tsx';

interface CreateAgentDialogProps {
    onCreated: (agentId: string) => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}

export function CreateAgentDialog({
    onCreated,
    onOpenChange,
    open,
    serverId,
}: CreateAgentDialogProps) {
    const create = useAgentCreate(serverId);

    const submit = React.useCallback(
        async (values: AgentCreationSubmitValues) => {
            const result = await create.createAgent({
                ...values,
                serverId,
            });
            return { agentId: result.agent.id };
        },
        [create.createAgent, serverId]
    );

    // The dialog stays mounted across opens, so a failed submit's error would
    // otherwise survive close and reappear stale the next time it opens.
    const handleOpenChange = React.useCallback(
        (next: boolean) => {
            if (!next) {
                create.reset();
            }
            onOpenChange(next);
        },
        [create.reset, onOpenChange]
    );

    return (
        <AgentCreationDialog
            error={create.error}
            isPending={create.isPending}
            onCreated={onCreated}
            onOpenChange={handleOpenChange}
            onSubmit={submit}
            open={open}
            serverId={serverId}
        />
    );
}
