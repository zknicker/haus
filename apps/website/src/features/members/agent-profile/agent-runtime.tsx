import { type Agent, agentReasoningEffortLabels, type ComputerInventory } from '@haus/api';
import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useAgentRuntime } from '../../../hooks/members/use-agent-runtime.ts';
import { RuntimeDialog } from './runtime-dialog.tsx';
import { resolveRuntimeConfig, runtimeConfigStatusLabel } from './runtime-model.ts';

type Runtime = ComputerInventory['runtimes'][number];
type ComputerHealth = Parameters<typeof runtimeConfigStatusLabel>[1];

export function AgentRuntime({
    agent,
    canEdit,
    computerHealth,
    runtimes,
    serverId,
}: {
    agent: Agent;
    canEdit: boolean;
    computerHealth: ComputerHealth;
    runtimes: Runtime[];
    serverId: string;
}) {
    const [open, setOpen] = React.useState(false);
    const configure = useAgentRuntime(serverId, agent.id);
    const execution = resolveRuntimeConfig(agent, runtimes);

    return (
        <>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-center justify-between gap-3">
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
                    <ExecutionRow
                        color={execution.runtime ? 'default' : 'warning'}
                        label="Runtime"
                        value={
                            execution.runtime
                                ? execution.runtimeLabel
                                : `${execution.runtimeLabel} · not installed`
                        }
                    />
                    <Separator />
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
                error={configure.error?.message ?? null}
                onOpenChange={setOpen}
                onSave={async (draft) => {
                    await configure.save(draft);
                    setOpen(false);
                }}
                open={open}
                pending={configure.isPending}
                runtimes={runtimes}
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
