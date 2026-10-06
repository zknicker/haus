import { toast } from '@heroui/react';
import { useEffect } from 'react';
import { useComputerUpdateCheck } from '../../hooks/servers/use-computer-update-check.ts';
import { useComputerUpdateStart } from '../../hooks/servers/use-computer-update-start.ts';
import { useHausUpdate } from '../updates/use-haus-update.ts';
import type { ComputerUpdateComputer } from './computer-update-card.tsx';
import { ComputerUpdateCard } from './computer-update-card.tsx';
import {
    type ComputerUpdatePreviewState,
    previewComputerUpdate,
} from './computer-update-preview.tsx';

export function ComputerUpdateControls({
    computer,
    previewState = 'live',
    serverId,
}: {
    computer: ComputerUpdateComputer;
    previewState?: ComputerUpdatePreviewState;
    serverId: string;
}) {
    const check = useComputerUpdateCheck(serverId);
    const update = useComputerUpdateStart(serverId, computer.id);
    const { isSequencing } = useHausUpdate();
    const previewComputer = previewComputerUpdate(computer, previewState);
    const isPreview = previewState !== 'live';

    useEffect(() => {
        if (isPreview && previewComputer.updatePhase === 'available') {
            showUpdateAvailableToast(previewComputer.updateTargetVersion);
        }
    }, [isPreview, previewComputer.updatePhase, previewComputer.updateTargetVersion]);

    const handleCheck = async () => {
        if (isPreview) {
            toast.info('Preview only', { description: 'No request was sent to this Computer.' });
            return;
        }
        try {
            const result = await check.mutateAsync({ computerId: computer.id, serverId });
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

    const handleUpdate = async () => {
        if (isPreview) {
            toast.info('Preview only', { description: 'No update was started.' });
            return;
        }
        try {
            const result = await update.mutateAsync({ computerId: computer.id, serverId });
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

    return (
        <ComputerUpdateCard
            computer={previewComputer}
            isChecking={isPreview ? previewComputer.updatePhase === 'checking' : check.isPending}
            isStarting={isPreview ? false : update.isPending}
            isUpdateBlocked={!isPreview && isSequencing}
            onCheck={handleCheck}
            onUpdate={handleUpdate}
        />
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Try again.';
}

function showUpdateAvailableToast(version: string | null) {
    toast.info('Update available', {
        description: version
            ? `Haus Computer ${version} is ready to install.`
            : 'A new Haus Computer release is ready to install.',
    });
}
