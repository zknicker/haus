import type { ComputerAgentAccessScope } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Label, ListBox, Select } from '@heroui/react';
import type { Key } from '@heroui/react';
import { useSetAgentAccessScope } from '../../hooks/computer-access/use-agent-access-scope.ts';
import {
    useGrantAgentAccess,
    useRevokeAgentAccess,
} from '../../hooks/computer-access/use-agent-access.ts';
import { useSetComputerUseEnabled } from '../../hooks/computer-use/use-computer-use-enabled.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import {
    type AgentAccessView,
    captainAccessScopes,
    captainAccessSentence,
    computerUseSentence,
} from './agent-access-model.ts';
import { CaptainChooser } from './captain-chooser.tsx';

interface AccessDevice {
    agentAccessScope: ComputerAgentAccessScope;
    canGrantAgentAccess: boolean;
    canRevokeAgentAccess: boolean;
    id: string;
}

export function CaptainAccessRow({
    computer,
    deviceKind,
    serverId,
    view,
}: {
    computer: AccessDevice;
    deviceKind: string;
    serverId: string;
    view: AgentAccessView;
}) {
    const grant = useGrantAgentAccess(serverId);
    const revoke = useRevokeAgentAccess(serverId);
    const setScope = useSetAgentAccessScope(serverId);
    const target = { computerId: computer.id, serverId };
    const isPending = grant.isPending || revoke.isPending || setScope.isPending;
    const steward = computer.canGrantAgentAccess || computer.canRevokeAgentAccess;
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Captain access</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    {captainAccessSentence(computer.agentAccessScope, view)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    {computer.agentAccessScope === 'selected' && steward ? (
                        <CaptainChooser
                            canGrant={computer.canGrantAgentAccess}
                            canRevoke={computer.canRevokeAgentAccess}
                            deviceKind={deviceKind}
                            isPending={isPending}
                            onChange={(change) => {
                                const mutation = change.kind === 'grant' ? grant : revoke;
                                withSaveErrorToast(() =>
                                    mutation.mutateAsync({ ...target, agentId: change.agentId })
                                ).catch(() => undefined);
                            }}
                            view={view}
                        />
                    ) : null}
                    <SettingSelect
                        disabledKeys={
                            computer.canGrantAgentAccess || computer.agentAccessScope === 'all'
                                ? []
                                : ['all']
                        }
                        isDisabled={!steward || isPending}
                        label="Captain access"
                        onChange={(scope) => {
                            withSaveErrorToast(() =>
                                setScope.mutateAsync({
                                    ...target,
                                    scope: scope as ComputerAgentAccessScope,
                                })
                            ).catch(() => undefined);
                        }}
                        options={captainAccessScopes}
                        value={computer.agentAccessScope}
                    />
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}

export function CaptainAccessUnresolved({ onRetry }: { onRetry: (() => void) | null }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Captain access</ItemCard.Title>
                {onRetry ? <SettingsRowError>Couldn’t load Captains.</SettingsRowError> : null}
            </ItemCard.Content>
            {onRetry ? (
                <ItemCard.Action>
                    <Button onPress={onRetry} size="sm" variant="secondary">
                        Retry
                    </Button>
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}

const computerUseOptions = [
    { id: 'on', label: 'On' },
    { id: 'off', label: 'Off' },
] as const;

export function ComputerUseRow({
    computer,
    serverId,
}: {
    computer: {
        canChangeComputerUse: boolean;
        canEnableComputerUse: boolean;
        computerUseEnabled: boolean;
        id: string;
    };
    serverId: string;
}) {
    const setEnabled = useSetComputerUseEnabled(serverId);
    const enabled = computer.computerUseEnabled;
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Computer use</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    {computerUseSentence(enabled)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <SettingSelect
                    disabledKeys={enabled || computer.canEnableComputerUse ? [] : ['on']}
                    isDisabled={!computer.canChangeComputerUse || setEnabled.isPending}
                    label="Computer use"
                    onChange={(key) => {
                        withSaveErrorToast(() =>
                            setEnabled.mutateAsync({
                                computerId: computer.id,
                                enabled: key === 'on',
                                serverId,
                            })
                        ).catch(() => undefined);
                    }}
                    options={computerUseOptions}
                    value={enabled ? 'on' : 'off'}
                />
            </ItemCard.Action>
        </ItemCard>
    );
}

export function SettingSelect({
    disabledKeys,
    isDisabled,
    label,
    onChange,
    options,
    value,
}: {
    disabledKeys: readonly string[];
    isDisabled: boolean;
    label: string;
    onChange: (key: string) => void;
    options: ReadonlyArray<{ id: string; label: string }>;
    value: string;
}) {
    return (
        <Select
            aria-label={label}
            disabledKeys={disabledKeys}
            isDisabled={isDisabled}
            onChange={(key: Key | null) => {
                if (key !== null && String(key) !== value) {
                    onChange(String(key));
                }
            }}
            value={value}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover placement="bottom end">
                <ListBox>
                    {options.map((option) => (
                        <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                            <Label>{option.label}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}
