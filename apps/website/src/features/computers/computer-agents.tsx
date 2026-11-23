import { DataGrid, type DataGridColumn, ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Chip } from '@heroui/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { availabilityBadgeColor } from '../members/agent-avatar.tsx';
import { agentExecutionLabels, availabilityLabel } from './presentation.ts';

type Agent = HausOutputs['agent']['list'][number];
type Computer = HausOutputs['computer']['list'][number];

interface ComputerAgentRow {
    availability: Agent['availability'];
    avatarUrl: string | null;
    displayName: string;
    id: string;
    model: string;
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
                        Captains on this device
                        {agents.data ? (
                            <span className="text-muted ms-2 tabular-nums">{rows.length}</span>
                        ) : null}
                    </ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {rows.length > 0 ? (
                    <ComputerAgentGrid onOpenAgent={openAgentProfile} rows={rows} />
                ) : (
                    <ComputerAgentsEmpty state={gridState} />
                )}
            </ItemCardGroup>
        </section>
    );
}

export function ComputerAgentGrid({
    onOpenAgent,
    rows,
}: {
    onOpenAgent: (agentId: string) => void;
    rows: ComputerAgentRow[];
}) {
    return (
        <DataGrid
            aria-label="Captains on this device"
            columns={agentColumns}
            contentClassName="min-w-160"
            data={rows}
            getRowId={(item) => item.id}
            onRowAction={(key) => onOpenAgent(String(key))}
        />
    );
}

/** No table without rows: one stock row says what is (or is not) here. */
export function ComputerAgentsEmpty({ state }: { state: ComputerAgentGridState }) {
    if (state.status === 'loading') {
        return (
            <div aria-busy="true" className="min-h-14">
                <span className="sr-only">Loading Captains</span>
            </div>
        );
    }
    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>
                        {state.status === 'unavailable'
                            ? 'Captains unavailable'
                            : 'No Captains on this device'}
                    </ItemCard.Title>
                </ItemCard.Content>
                {state.status === 'unavailable' ? (
                    <ItemCard.Action>
                        <Button onPress={state.onRetry} size="sm" variant="secondary">
                            Retry
                        </Button>
                    </ItemCard.Action>
                ) : null}
            </ItemCard>
        </ItemCardGroup>
    );
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
        header: 'Captain',
        id: 'displayName',
        isRowHeader: true,
        minWidth: 180,
        sortFn: (a, b) => a.displayName.localeCompare(b.displayName),
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
