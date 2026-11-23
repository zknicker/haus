import { useEffect } from 'react';
import { useHausUpdate } from '../updates/use-haus-update.ts';
import type { ComputerUpdateComputer } from './computer-update-card.tsx';
import { ComputerUpdateCard } from './computer-update-card.tsx';
import {
    showUpdateAvailableToast,
    useComputerUpdateActions,
} from './use-computer-update-actions.ts';

export function ComputerUpdateControls({
    computer,
    isPreview,
    serverId,
}: {
    computer: ComputerUpdateComputer;
    isPreview: boolean;
    serverId: string;
}) {
    const actions = useComputerUpdateActions({ computerId: computer.id, isPreview, serverId });
    const { isRunning } = useHausUpdate();

    useEffect(() => {
        if (isPreview && computer.updatePhase === 'available') {
            showUpdateAvailableToast(computer.updateTargetVersion);
        }
    }, [isPreview, computer.updatePhase, computer.updateTargetVersion]);

    return (
        <ComputerUpdateCard
            computer={computer}
            isChecking={isPreview ? computer.updatePhase === 'checking' : actions.isChecking}
            isStarting={isPreview ? false : actions.isStarting}
            isUpdateBlocked={!isPreview && isRunning}
            onCheck={actions.check}
            onUpdate={actions.update}
        />
    );
}
