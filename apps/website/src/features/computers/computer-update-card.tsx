import { ItemCard } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import { UpdateProgressBar } from '../updates/haus-update-progress.tsx';
import { computerUpdateStatus, computerUpdateView } from './computer-update-model.ts';

export type ComputerUpdateComputer = HausOutputs['computer']['list'][number];

export function ComputerUpdateCard({
    computer,
    isChecking,
    isStarting,
    isUpdateBlocked = false,
    onCheck,
    onUpdate,
}: {
    computer: ComputerUpdateComputer;
    isChecking: boolean;
    isStarting: boolean;
    /** The sidebar updater is sequencing updates; a parallel start would race it. */
    isUpdateBlocked?: boolean;
    onCheck: () => void;
    onUpdate: () => void;
}) {
    const view = computerUpdateView({
        ...updateInput(computer),
        isChecking: isChecking || isStarting,
    });
    const downloadProgress = computerDownloadProgress(computer);
    const status = computerUpdateStatus(updateInput(computer));
    const isCheckPending = isChecking || (computer.updatePhase === 'checking' && !view.stalled);
    const showUpdate = view.canUpdate || isStarting;

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsStatusTitle
                    status={
                        status ? (
                            <SettingsStatusChip color={status.color}>
                                {status.label}
                            </SettingsStatusChip>
                        ) : null
                    }
                >
                    Software update
                </SettingsStatusTitle>
                {view.detail ? (
                    <ItemCard.Description className="whitespace-normal">
                        {view.detail}
                    </ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            <ItemCard.Action>
                {view.isUpdateActive ? (
                    <UpdateProgressBar label={view.label} progress={downloadProgress} />
                ) : showUpdate ? (
                    <Button
                        isDisabled={!view.canUpdate || isUpdateBlocked}
                        isPending={isStarting}
                        onPress={onUpdate}
                        size="sm"
                    >
                        {updateButtonLabel(computer.updateTargetVersion)}
                    </Button>
                ) : view.canCheck || isCheckPending ? (
                    <Button
                        isDisabled={!view.canCheck}
                        isPending={isCheckPending}
                        onPress={onCheck}
                        size="sm"
                        variant="secondary"
                    >
                        Check
                    </Button>
                ) : null}
            </ItemCard.Action>
        </ItemCard>
    );
}

export function updateInput(computer: ComputerUpdateComputer) {
    return {
        health: computer.health,
        installedVersion: computer.productVersion,
        phase: computer.updatePhase,
        targetVersion: computer.updateTargetVersion,
        updateUpdatedAt: computer.updateUpdatedAt,
    };
}

function updateButtonLabel(version: string | null) {
    if (!version) {
        return 'Update';
    }
    return `Update to ${version.startsWith('v') ? version : `v${version}`}`;
}

function computerDownloadProgress(computer: ComputerUpdateComputer) {
    if (
        computer.updatePhase !== 'downloading' ||
        computer.updateDownloadedBytes === null ||
        computer.updateTotalBytes === null ||
        computer.updateTotalBytes === 0
    ) {
        return null;
    }
    return computer.updateDownloadedBytes / computer.updateTotalBytes;
}
