import { Chip } from '@heroui/react';
import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import { InboxIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { availabilityBadgeColor } from '../members/agent-avatar.tsx';
import { ComputerDataGridState } from './computer-data-grid-state.tsx';
import { agentExecutionLabels, availabilityLabel } from './presentation.ts';

type Agent = HausOutputs['agent']['list'][number];
type Computer = HausOutputs['computer']['list'][number];

interface ComputerAgentRow {
    availability: Agent['availability'];
    avatarUrl: string | null;
    displayName: string;
    id: string;
    model: string;
    runtime: string;
    wakePause: Agent['wakePause'];
}

type ComputerAgentGridState =
    | { status: 'loading' | 'ready' }
    | { onRetry: () => void; status: 'unavailable' };

export function ComputerAgents({ computerId, serverId }: { computerId: string; serverId: string }) {
    const openAgentProfile = useOpenAgentProfile();
    const agents = useAgents(serverId);
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const items = (agents.data ?? []).filter((agent) => agent.computerId === computerId);

    if (!computer) {
        return null;
    }

    const rows = computerAgentRows(items, computer.reportedInventory);
    const gridState: ComputerAgentGridState =
        agents.data !== undefined
            ? { status: 'ready' }
            : agents.isError
              ? { onRetry: () => void agents.refetch(), status: 'unavailable' }
              : { status: 'loading' };

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>
                        Agents on This Computer
                        {agents.data ? (
                            <span className="ms-2 text-muted tabular-nums">{rows.length}</span>
                        ) : null}
                    </ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ComputerAgentGrid onOpenAgent={openAgentProfile} rows={rows} state={gridState} />
            </ItemCardGroup>
        </section>
    );
}

export function ComputerAgentGrid({
    onOpenAgent,
    rows,
    state,
}: {
    onOpenAgent: (agentId: string) => void;
    rows: ComputerAgentRow[];
    state: ComputerAgentGridState;
}) {
    return (
        <DataGrid
            aria-label="Agents on this Computer"
            columns={agentColumns}
            contentClassName={rows.length === 0 ? 'min-h-64 min-w-160' : 'min-w-160'}
            data={rows}
            getRowId={(item) => item.id}
            onRowAction={(key) => onOpenAgent(String(key))}
            renderEmptyState={() => <ComputerAgentGridEmptyState state={state} />}
        />
    );
}

function ComputerAgentGridEmptyState({ state }: { state: ComputerAgentGridState }) {
    if (state.status === 'loading') {
        return <ComputerDataGridState label="Loading Agents" status="loading" />;
    }
    if (state.status === 'unavailable') {
        return (
            <ComputerDataGridState
                label="Agents unavailable"
                onRetry={state.onRetry}
                status="unavailable"
            />
        );
    }
    return <ComputerDataGridState icon={InboxIcon} label="No Agents assigned" status="empty" />;
}

function computerAgentRows(
    agents: Agent[],
    inventory: Computer['reportedInventory']
): ComputerAgentRow[] {
    return agents.map((agent) => {
        const execution = agentExecutionLabels(agent, inventory);
        return {
            avatarUrl: agent.avatarUrl,
            availability: agent.availability,
            displayName: agent.displayName,
            id: agent.id,
            wakePause: agent.wakePause,
            model: execution.model,
            runtime: execution.runtime,
        };
    });
}

const agentColumns: DataGridColumn<ComputerAgentRow>[] = [
    {
        allowsSorting: true,
        cell: (item) => (
            <div className="flex min-w-0 items-center gap-3">
                <EntityAvatar
                    className="shrink-0"
                    name={item.displayName}
                    size="sm"
                    src={item.avatarUrl}
                />
                <p className="truncate font-medium">{item.displayName}</p>
            </div>
        ),
        header: 'Agent',
        id: 'displayName',
        isRowHeader: true,
        minWidth: 180,
        sortFn: (a, b) => a.displayName.localeCompare(b.displayName),
    },
    {
        accessorKey: 'runtime',
        allowsSorting: true,
        cellClassName: 'text-muted',
        header: 'Runtime',
        id: 'runtime',
        minWidth: 120,
    },
    {
        accessorKey: 'model',
        allowsSorting: true,
        cellClassName: 'text-muted',
        header: 'Model',
        id: 'model',
        minWidth: 160,
    },
    {
        align: 'end',
        cell: (item) => (
            <Chip color={availabilityBadgeColor(item.availability)} size="lg" variant="soft">
                {availabilityLabel(item)}
            </Chip>
        ),
        header: 'Status',
        id: 'availability',
        minWidth: 100,
    },
];
