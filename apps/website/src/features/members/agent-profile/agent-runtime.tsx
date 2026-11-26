import { type Agent, agentReasoningEffortLabels } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import * as React from 'react';
import { useAgentRuntime } from '../../../hooks/members/use-agent-runtime.ts';
import { useModelConnections } from '../../../hooks/servers/use-model-connections.ts';
import {
    SettingsStatusChip,
    SettingsStatusTitle,
} from '../../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import { AgentModelConnectionRow } from './agent-model-connection-row.tsx';
import { ProfileListSection } from './profile-list-section.tsx';
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
            <ProfileListSection
                action={
                    canEdit ? (
                        <Button onPress={() => setOpen(true)} size="sm" variant="secondary">
                            Edit
                        </Button>
                    ) : null
                }
                title="Model"
            >
                <ExecutionRow
                    label="Model"
                    problem={execution.model ? undefined : 'Not installed'}
                    value={execution.modelLabel}
                />
                <Separator />
                <AgentModelConnectionRow agent={agent} canEdit={canEdit} />
                <ExecutionRow
                    label="Reasoning effort"
                    value={agentReasoningEffortLabels[agent.desiredReasoningEffort]}
                />
                {agent.status === 'applied' ? null : (
                    <>
                        <Separator />
                        <ItemCard>
                            <ItemCard.Content>
                                <SettingsStatusTitle
                                    status={
                                        <SettingsStatusChip
                                            color={
                                                agent.status === 'degraded' ? 'danger' : 'warning'
                                            }
                                        >
                                            {runtimeConfigStatusLabel(agent, computerHealth)}
                                        </SettingsStatusChip>
                                    }
                                >
                                    Status
                                </SettingsStatusTitle>
                            </ItemCard.Content>
                        </ItemCard>
                    </>
                )}
            </ProfileListSection>
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
 * One resolved execution fact: a named thing on the left, its current value
 * on the right. A healthy value is a plain fact; only a problem earns a chip,
 * beside the title (Settings copy rule 4).
 */
function ExecutionRow({
    label,
    problem,
    value,
}: {
    label: string;
    problem?: string;
    value: string;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                {problem ? (
                    <SettingsStatusTitle
                        status={<SettingsStatusChip color="warning">{problem}</SettingsStatusChip>}
                    >
                        {label}
                    </SettingsStatusTitle>
                ) : (
                    <ItemCard.Title>{label}</ItemCard.Title>
                )}
            </ItemCard.Content>
            <ItemCard.Action>
                <SettingsFact>{value}</SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
