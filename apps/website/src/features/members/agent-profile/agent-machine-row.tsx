import type { Agent } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import * as React from 'react';
import { useAgentMachine, useSetAgentMachine } from '../../../hooks/members/use-agent-machine.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { type MachineOption, machineRowView } from '../../computers/machine-model.ts';
import { MachineSelect } from '../../computers/machine-select.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { MachineChangeDialog } from './machine-change-dialog.tsx';

export function AgentMachineRow({ agent, canEdit }: { agent: Agent; canEdit: boolean }) {
    const computers = useComputers(agent.serverId);
    const machine = useAgentMachine(agent.serverId, agent.id);
    const setMachine = useSetAgentMachine(agent.serverId, agent.id);
    const [target, setTarget] = React.useState<MachineOption | null>(null);
    const currentId = machine.data?.computerId ?? agent.computerId;
    const { current, options, pending } = machineRowView({
        agentId: agent.id,
        change: machine.data?.change ?? null,
        currentId,
        devices: computers.data ?? [],
    });
    const request = (computerId: string, fromLastSynced: boolean) =>
        setMachine.mutate(
            { agentId: agent.id, computerId, fromLastSynced, serverId: agent.serverId },
            { onSuccess: () => setTarget(null) }
        );

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Machine</ItemCard.Title>
                {pending ? (
                    <ItemCard.Description className="whitespace-normal">
                        {pending}
                    </ItemCard.Description>
                ) : null}
                {target ? null : (
                    <SettingsRowError>
                        {setMachine.error?.message ?? computers.error?.message}
                    </SettingsRowError>
                )}
            </ItemCard.Content>
            <ItemCard.Action>
                {pending && canEdit ? (
                    <Button
                        isPending={setMachine.isPending}
                        onPress={() => request(currentId, false)}
                        size="sm"
                        variant="secondary"
                    >
                        Cancel move
                    </Button>
                ) : (
                    <MachineSelect
                        className="w-56"
                        isDisabled={!(canEdit && computers.data && machine.data)}
                        label="Machine"
                        onSelect={(id) => {
                            setMachine.reset();
                            setTarget(options.find((option) => option.id === id) ?? null);
                        }}
                        options={options}
                        value={currentId}
                    />
                )}
            </ItemCard.Action>
            {target ? (
                <MachineChangeDialog
                    agentName={agent.displayName}
                    error={setMachine.error?.message}
                    from={current}
                    onConfirm={({ fromLastSynced }) => request(target.id, fromLastSynced)}
                    onOpenChange={(open) => {
                        if (!open) {
                            setTarget(null);
                        }
                    }}
                    pending={setMachine.isPending}
                    to={target}
                />
            ) : null}
        </ItemCard>
    );
}
