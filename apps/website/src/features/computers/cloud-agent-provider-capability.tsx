import type { CloudAgentProvider } from '@haus/api';
import { toast } from '@heroui/react';
import { useState } from 'react';
import {
    useCloudAgentCancelSignIn,
    useCloudAgentCapability,
    useCloudAgentConnect,
    useCloudAgentDisconnect,
    useCloudAgentMakeDefault,
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
 * One provider's access on this Computer. Cursor signs in from Haus: the
 * Computer owns the sign-in and the App opens its link on this device. Claude
 * reuses the Computer's own Claude Code login, so its row only checks again.
 */
export function CloudAgentProviderCapability({
    computerId,
    provider,
    serverId,
}: {
    computerId: string;
    provider: CloudAgentProvider;
    serverId: string;
}) {
    const target = { computerId, provider, serverId };
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const isOffline = computer ? computer.health === 'offline' : true;
    const capability = useCloudAgentCapability(target, Boolean(computer) && !isOffline);
    const connect = useCloudAgentConnect(target);
    const disconnect = useCloudAgentDisconnect(target);
    const makeDefault = useCloudAgentMakeDefault(target);
    const cancel = useCloudAgentCancelSignIn(target);
    const [signInOpen, setSignInOpen] = useState(false);
    const state =
        capability.data ??
        reportedCloudAgentCapability(computer?.reportedInventory ?? null, provider);

    const view = cloudAgentCapabilityView({
        isConnecting: connect.isPending,
        isOffline,
        provider,
        state,
    });

    const handleConnect = async () => {
        if (provider === 'claude') {
            await recheck();
            return;
        }
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

    const recheck = async () => {
        try {
            const checked = await connect.mutateAsync(target);
            if (!checked.ready) {
                toast.info('Claude Code is not signed in on this Computer yet');
            }
        } catch (error) {
            toast.danger('Couldn’t check Claude Code', { description: errorMessage(error) });
        }
    };

    const handleMakeDefault = async () => {
        try {
            await makeDefault.mutateAsync(target);
            toast.success(`${view.providerName} is now the default cloud agent`);
        } catch (error) {
            toast.danger('Couldn’t change the default cloud agent', {
                description: errorMessage(error),
            });
        }
    };

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
        <>
            <CloudAgentCapabilityRow
                isBusy={disconnect.isPending || makeDefault.isPending}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onMakeDefault={handleMakeDefault}
                view={view}
            />
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
        </>
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Try again.';
}
