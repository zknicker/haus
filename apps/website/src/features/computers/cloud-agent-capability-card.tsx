import { toast } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import { useState } from 'react';
import {
    useCloudAgentCancelSignIn,
    useCloudAgentCapability,
    useCloudAgentConnect,
    useCloudAgentDisconnect,
} from '../../hooks/servers/use-cloud-agent-capability.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import {
    cloudAgentCapabilityView,
    reportedCloudAgentCapability,
} from './cloud-agent-capability-model.ts';
import { CloudAgentCapabilityRow } from './cloud-agent-capability-row.tsx';
import { CloudAgentSignInDialog } from './cloud-agent-sign-in-dialog.tsx';
import { cloudAgentSignInView } from './cloud-agent-sign-in-model.ts';

/**
 * Cloud Agent provider access on this Computer — a capability of the machine,
 * beside its runtimes, not a runtime itself. The two stay separate because
 * Cursor's CLI and its SDK use different credential stores even for one
 * account. The Computer owns sign-in; the App opens its link on this device.
 */
export function CloudAgentCapabilityCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const target = { computerId, provider: 'cursor' as const, serverId };
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const isOffline = computer ? computer.health === 'offline' : true;
    const capability = useCloudAgentCapability(target, Boolean(computer) && !isOffline);
    const connect = useCloudAgentConnect(target);
    const disconnect = useCloudAgentDisconnect(target);
    const cancel = useCloudAgentCancelSignIn(target);
    const [signInOpen, setSignInOpen] = useState(false);
    const state =
        capability.data ?? reportedCloudAgentCapability(computer?.reportedInventory ?? null);

    const view = cloudAgentCapabilityView({
        isConnecting: connect.isPending,
        isOffline,
        state,
    });

    const handleConnect = async () => {
        setSignInOpen(true);
        cancel.reset();
        if (state?.signIn?.status === 'waiting') {
            return;
        }
        try {
            await connect.mutateAsync(target);
        } catch {
            // The dialog keeps the mutation error beside its retry action.
        }
    };

    const handleCancel = async () => {
        try {
            await cancel.mutateAsync(target);
            setSignInOpen(false);
        } catch {
            // Keep the dialog open so cancellation can be retried.
        }
    };

    const signInView = cloudAgentSignInView({
        isOffline,
        isStarting: connect.isPending,
        error: connect.error,
        state,
    });

    const handleDisconnect = async () => {
        try {
            await disconnect.mutateAsync(target);
            toast.success('Cursor disconnected', {
                description: 'The key stays revocable from Cursor’s dashboard.',
            });
        } catch (error) {
            toast.danger('Couldn’t disconnect Cursor', { description: errorMessage(error) });
        }
    };

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Cloud Agents</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <CloudAgentCapabilityRow
                        isDisconnecting={disconnect.isPending}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        view={view}
                    />
                </ItemCardGroup>
            </ItemCardGroup>
            {signInOpen ? (
                <CloudAgentSignInDialog
                    computerName={computer?.name ?? 'this Computer'}
                    error={
                        cancel.error
                            ? errorMessage(cancel.error)
                            : capability.error
                              ? 'Could not check sign-in status. Haus will retry automatically.'
                              : null
                    }
                    isCancelling={cancel.isPending}
                    onCancel={handleCancel}
                    onClose={() => setSignInOpen(false)}
                    onRetry={handleConnect}
                    view={signInView}
                />
            ) : null}
        </section>
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Try again.';
}
