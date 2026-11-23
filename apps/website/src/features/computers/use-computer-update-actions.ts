import { toast } from '@heroui/react';
import { useComputerUpdateCheck } from '../../hooks/servers/use-computer-update-check.ts';
import { useComputerUpdateStart } from '../../hooks/servers/use-computer-update-start.ts';

export function useComputerUpdateActions({
    computerId,
    isPreview,
    serverId,
}: {
    computerId: string;
    isPreview: boolean;
    serverId: string;
}) {
    const check = useComputerUpdateCheck(serverId);
    const update = useComputerUpdateStart(serverId, computerId);

    const runCheck = async () => {
        if (isPreview) {
            toast.info('Preview only', { description: 'No request was sent to this device.' });
            return;
        }
        try {
            const result = await check.mutateAsync({ computerId, serverId });
            if (result.available) {
                showUpdateAvailableToast(result.version);
            } else {
                toast.success('Haus Computer is up to date', {
                    description: `Version ${result.version} is the latest production release.`,
                });
            }
        } catch (error) {
            toast.danger('Couldn’t check for updates', { description: errorMessage(error) });
        }
    };

    const runUpdate = async () => {
        if (isPreview) {
            toast.info('Preview only', { description: 'No update was started.' });
            return;
        }
        try {
            const result = await update.mutateAsync({ computerId, serverId });
            if (result.started) {
                toast.success('Update started', {
                    description: `Installing Haus Computer ${result.version}.`,
                });
            } else {
                toast.info('Haus Computer is up to date', {
                    description: `Version ${result.version} is already installed.`,
                });
            }
        } catch (error) {
            toast.danger('Couldn’t start the update', { description: errorMessage(error) });
        }
    };

    return {
        check: runCheck,
        isChecking: check.isPending,
        isStarting: update.isPending,
        update: runUpdate,
    };
}

export function showUpdateAvailableToast(version: string | null) {
    toast.info('Update available', {
        description: version
            ? `Haus Computer ${version} is ready to install.`
            : 'A new Haus Computer release is ready to install.',
    });
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Try again.';
}
