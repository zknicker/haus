import type { CloudAgentCapabilityState } from '@haus/api';
import { Button, Chip, toast } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useState } from 'react';
import {
    useCloudAgentCapability,
    useCloudAgentConfigure,
    useCloudAgentDisconnect,
    useCloudAgentPrepare,
} from '../../hooks/servers/use-cloud-agent-capability.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { ClaudeCloudSetupDialog } from './claude-cloud-setup-dialog.tsx';
import { cloudAgentCapabilityView } from './cloud-agent-capability-model.ts';

/** Claude credentials stay in the Computer's native CLI store. */
export function ClaudeCloudCapabilityRow({
    computerId,
    serverId,
    isOffline,
}: {
    computerId: string;
    serverId: string;
    isOffline: boolean;
}) {
    const target = { computerId, serverId, provider: 'claude' as const };
    const capability = useCloudAgentCapability(target, !isOffline);
    const configure = useCloudAgentConfigure(target);
    const disconnect = useCloudAgentDisconnect(target);
    const [setup, setSetup] = useState<NonNullable<
        CloudAgentCapabilityState['bootstrapSetup']
    > | null>(null);
    const connect = useCloudAgentPrepare(target, setSetup);
    const prepare = async () => {
        disconnect.reset();
        try {
            await connect.mutateAsync();
        } catch {
            /* The row keeps the setup error beside its action. */
        }
    };
    const revoke = async () => {
        try {
            await disconnect.mutateAsync(target);
            setSetup(null);
            toast.success('Claude Cloud disconnected');
        } catch {
            /* The row keeps the revocation error beside its action. */
        }
    };
    const state = capability.data;
    const settings = state?.settings;
    const view = cloudAgentCapabilityView({ isConnecting: false, isOffline, state: state ?? null });
    return (
        <>
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>
                        Claude Cloud Agents
                        <Chip
                            className="ms-2 align-middle"
                            color={
                                view.status === 'ready'
                                    ? 'success'
                                    : view.status === 'unavailable'
                                      ? 'default'
                                      : 'warning'
                            }
                            size="sm"
                            variant="soft"
                        >
                            {view.statusLabel}
                        </Chip>
                    </ItemCard.Title>
                    <ItemCard.Description>{view.description}</ItemCard.Description>
                    <SettingsRowError>
                        {disconnect.error?.message ??
                            connect.error?.message ??
                            configure.error?.message ??
                            capability.error?.message ??
                            null}
                    </SettingsRowError>
                </ItemCard.Content>
                <ItemCard.Action>
                    {view.canDisconnect ? (
                        <Button
                            isPending={disconnect.isPending}
                            onPress={revoke}
                            size="sm"
                            variant="danger-soft"
                        >
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            isDisabled={isOffline || !state}
                            isPending={connect.isPending}
                            onPress={prepare}
                            size="sm"
                            variant="secondary"
                        >
                            Set up
                        </Button>
                    )}
                </ItemCard.Action>
            </ItemCard>
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Default cloud agent</ItemCard.Title>
                    <ItemCard.Description>
                        Agents can choose either connection explicitly. Haus never falls back
                        silently.
                    </ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <div className="flex items-center gap-2">
                        {(['cursor', 'claude'] as const).map((provider) => (
                            <Button
                                aria-pressed={settings?.defaultProvider === provider}
                                isDisabled={isOffline || !settings || configure.isPending}
                                key={provider}
                                onPress={() => {
                                    void configure
                                        .mutateAsync({
                                            ...target,
                                            settings: { defaultProvider: provider },
                                        })
                                        .catch(() => undefined);
                                }}
                                size="sm"
                                variant={
                                    settings?.defaultProvider === provider ? 'primary' : 'secondary'
                                }
                            >
                                {provider === 'cursor' ? 'Cursor' : 'Claude'}
                            </Button>
                        ))}
                    </div>
                </ItemCard.Action>
            </ItemCard>
            {setup ? (
                <ClaudeCloudSetupDialog
                    computerId={computerId}
                    isChecking={capability.isFetching}
                    onClose={() => setSetup(null)}
                    onRecheck={() => {
                        void capability.refetch();
                    }}
                    ready={state?.ready ?? false}
                    setup={setup}
                />
            ) : null}
        </>
    );
}
