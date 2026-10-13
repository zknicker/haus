import { toast } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { useState } from 'react';
import {
    canUseOnePassword,
    useComputerSecretsDisconnect,
    useComputerSecretsRefresh,
} from '../../hooks/servers/use-computer-secrets.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useOnePasswordConnect } from '../../hooks/servers/use-onepassword-connect.ts';
import { secretsCapabilityView } from './secrets-capability-model.ts';
import { SecretsCapabilityRow } from './secrets-capability-row.tsx';
import { SecretsConnectDialog } from './secrets-connect-dialog.tsx';
import { SecretsDisconnectDialog } from './secrets-disconnect-dialog.tsx';

/**
 * Secrets is a Computer capability: one 1Password vault every Agent on this
 * Computer can read through `haus-secrets`. The token lives on the Computer;
 * this row reads the Computer's own status report.
 */
export function SecretsCapabilityCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const target = { computerId, serverId };
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const computerName = computer?.name ?? 'this Computer';
    const status = computer?.reportedInventory?.secrets ?? null;
    const flow = useOnePasswordConnect(target, computerName);
    const refresh = useComputerSecretsRefresh(target);
    const disconnect = useComputerSecretsDisconnect(target);
    const [dialog, setDialog] = useState<'connect' | 'disconnect' | null>(null);
    const view = secretsCapabilityView({
        canUseOnePassword: canUseOnePassword(),
        isOffline: computer ? computer.health === 'offline' : true,
        status,
    });

    const handleRefresh = async () => {
        if (!status?.connected) {
            return;
        }
        try {
            const next = await refresh.refresh({
                account: status.account,
                vaultId: status.vault.id,
            });
            toast.success('1Password items refreshed', {
                description: next.connected
                    ? `Agents can use ${next.items.length === 1 ? '1 item' : `${next.items.length} items`} from “${next.vault.name}”.`
                    : undefined,
            });
        } catch (error) {
            toast.danger('Couldn’t refresh 1Password items', {
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
    };

    const handleDisconnect = async (serviceAccountName: string) => {
        try {
            await disconnect.mutateAsync(target);
            setDialog(null);
            toast.success('1Password disconnected', {
                description: `Delete the service account “${serviceAccountName}” on 1password.com to finish.`,
            });
        } catch (error) {
            toast.danger('Couldn’t disconnect 1Password', {
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
    };

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Secrets</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <SecretsCapabilityRow
                        isBusy={refresh.isPending || disconnect.isPending}
                        onConnect={() => {
                            setDialog('connect');
                            void flow.start();
                        }}
                        onDisconnect={() => setDialog('disconnect')}
                        onRefresh={() => {
                            void handleRefresh();
                        }}
                        view={view}
                    />
                </ItemCardGroup>
            </ItemCardGroup>
            {dialog === 'connect' ? (
                <SecretsConnectDialog
                    computerName={computerName}
                    onClose={() => {
                        setDialog(null);
                        flow.reset();
                    }}
                    onConnect={(account, vault) => {
                        void flow.connect(account, vault);
                    }}
                    onRetry={() => {
                        void flow.start();
                    }}
                    state={flow.state}
                />
            ) : null}
            {status?.connected ? (
                <SecretsDisconnectDialog
                    computerName={computerName}
                    isOpen={dialog === 'disconnect'}
                    isPending={disconnect.isPending}
                    onClose={() => setDialog(null)}
                    onDisconnect={() => {
                        void handleDisconnect(status.serviceAccountName);
                    }}
                    serviceAccountName={status.serviceAccountName}
                />
            ) : null}
        </section>
    );
}
