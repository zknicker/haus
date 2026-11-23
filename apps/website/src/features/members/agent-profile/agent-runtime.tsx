import { type Agent, agentReasoningEffortLabels } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Chip, Separator } from '@heroui/react';
import * as React from 'react';
import { useAgentRuntime } from '../../../hooks/members/use-agent-runtime.ts';
import { useModelConnections } from '../../../hooks/servers/use-model-connections.ts';
import { AgentModelConnectionRow } from './agent-model-connection-row.tsx';
import { RuntimeDialog } from './runtime-dialog.tsx';
import { resolveRuntimeConfig, runtimeConfigStatusLabel } from './runtime-model.ts';

type ComputerHealth = Parameters<typeof runtimeConfigStatusLabel>[1];

export function AgentRuntime({
    agent,
    canEdit,
    computerHealth,
    serverId,
}: {
    agent: Agent;
    canEdit: boolean;
    computerHealth: ComputerHealth;
    serverId: string;
}) {
    const [open, setOpen] = React.useState(false);
    const configure = useAgentRuntime(serverId, agent.id);
    const modelConnections = useModelConnections(serverId).data;
    const catalog = modelConnections?.runnerModels ?? [];
    const execution = resolveRuntimeConfig(agent, catalog);

    return (
        <>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Model</ItemCardGroup.Title>
                    {canEdit ? (
                        <Button onPress={() => setOpen(true)} size="sm" variant="secondary">
                            Edit
                        </Button>
                    ) : null}
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ExecutionRow
                        color={execution.model ? 'accent' : 'warning'}
                        label="Model"
                        value={
                            execution.model
                                ? execution.modelLabel
                                : `${execution.modelLabel} · not installed`
                        }
                    />
                    <Separator />
                    <AgentModelConnectionRow agent={agent} canEdit={canEdit} />
                    <ExecutionRow
                        color="default"
                        label="Reasoning effort"
                        value={agentReasoningEffortLabels[agent.desiredReasoningEffort]}
                    />
                    {agent.status === 'applied' ? null : (
                        <>
                            <Separator />
                            <ExecutionRow
                                color={agent.status === 'degraded' ? 'danger' : 'warning'}
                                label="Status"
                                value={runtimeConfigStatusLabel(agent, computerHealth)}
                            />
                        </>
                    )}
                </ItemCardGroup>
            </ItemCardGroup>
            <RuntimeDialog
                agent={agent}
                connections={modelConnections?.connections ?? []}
                error={configure.error?.message ?? null}
                onOpenChange={setOpen}
                onSave={async (draft) => {
                    await configure.save(draft);
                    setOpen(false);
                }}
                open={open}
                pending={configure.isPending}
                runtimes={catalog}
            />
        </>
    );
}

/**
 * One resolved execution fact. These were a wrapping row of labelled chips,
 * which read as a summary strip rather than as the settings rows they are —
 * a named thing on the left, its current value on the right.
 */
function ExecutionRow({
    color,
    label,
    value,
}: {
    color: React.ComponentProps<typeof Chip>['color'];
    label: string;
    value: string;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{label}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <Chip color={color} size="sm" variant="soft">
                    <Chip.Label>{value}</Chip.Label>
                </Chip>
            </ItemCard.Action>
        </ItemCard>
    );
}
