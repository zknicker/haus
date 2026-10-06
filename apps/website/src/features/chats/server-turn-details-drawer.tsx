import { Drawer } from '@heroui/react';
import type * as React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useAgentTurnActivityHistory } from '../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurn } from '../../hooks/members/use-agent-turns.ts';
import type { TurnDetailAccess } from '../members/agent-profile/agent-activity-model.ts';
import { groupAgentActivityTurns } from '../members/agent-profile/agent-activity-turns.ts';
import { TurnTrace } from '../turn-trace/turn-trace.tsx';

export function ServerTurnDetailsDrawer({
    access,
    agentAvatarUrl,
    agentId,
    agentName,
    onOpenChange,
    open,
    runId,
    serverId,
}: {
    access: TurnDetailAccess;
    agentAvatarUrl?: string | null;
    agentId: string | null;
    agentName: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    runId: string | null;
    serverId: string;
}) {
    return (
        <TurnDetailsDrawer
            agentAvatarUrl={agentAvatarUrl}
            agentName={agentName}
            onOpenChange={onOpenChange}
            open={open}
        >
            <ServerTurnTrace
                access={access}
                agentId={agentId}
                open={open}
                runId={runId}
                serverId={serverId}
            />
        </TurnDetailsDrawer>
    );
}

function TurnDetailsDrawer({
    agentAvatarUrl,
    agentName,
    children,
    onOpenChange,
    open,
}: {
    agentAvatarUrl?: string | null;
    agentName: string;
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}) {
    return (
        <Drawer.Backdrop isOpen={open} onOpenChange={onOpenChange}>
            <Drawer.Content placement="right">
                {/* The trace prints code and diffs, so this drawer takes the
                    wider measure named in `default-theme.css`. */}
                <Drawer.Dialog className="drawer__dialog--turn-details">
                    <Drawer.CloseTrigger />
                    <Drawer.Header>
                        <div className="flex items-center gap-2.5">
                            <EntityAvatar name={agentName} size="lg" src={agentAvatarUrl} />
                            <div className="min-w-0">
                                <Drawer.Heading>Turn details</Drawer.Heading>
                                <p className="truncate text-muted text-sm">{agentName}</p>
                            </div>
                        </div>
                    </Drawer.Header>
                    <Drawer.Body>{children}</Drawer.Body>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}

/** Resolves the run's durable turn, then hands it to the shared trace. */
function ServerTurnTrace({
    access,
    agentId,
    open,
    runId,
    serverId,
}: {
    access: TurnDetailAccess;
    agentId: string | null;
    open: boolean;
    runId: string | null;
    serverId: string;
}) {
    const activity = useAgentTurnActivityHistory(serverId, agentId ?? '', runId);
    const settledTurn = useAgentTurn(serverId, agentId ?? '', runId);
    const turn =
        groupAgentActivityTurns(activity.data?.events ?? [], settledTurn.data ?? [])[0] ?? null;

    if (runId && activity.isPending && settledTurn.isPending) {
        return <p className="text-muted text-sm">Loading turn activity...</p>;
    }
    if (runId && !turn && activity.error && settledTurn.error) {
        return <p className="text-muted text-sm">Turn activity is unavailable right now.</p>;
    }

    return (
        <TurnTrace
            access={access}
            agentId={agentId}
            enabled={open}
            outcome={turn}
            runId={runId}
            serverId={serverId}
            turn={turn}
        />
    );
}
