import { Button, Tooltip } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useEffect, useReducer } from 'react';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { UpdateProgressBar } from '../updates/haus-update-progress.tsx';
import { offlineComputerUpdateExpiry } from '../updates/offline-computer-update.ts';
import { stalledComputerUpdateExpiry } from '../updates/stalled-computer-update.ts';
import { computerUpdateView } from './computer-update-model.ts';

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
    useUpdateExpiryRefresh(computer);
    const view = computerUpdateView({
        health: computer.health,
        installedVersion: computer.productVersion,
        isChecking: isChecking || isStarting,
        phase: computer.updatePhase,
        targetVersion: computer.updateTargetVersion,
        updateUpdatedAt: computer.updateUpdatedAt,
    });
    const downloadProgress = computerDownloadProgress(computer);
    const isCheckPending = isChecking || (computer.updatePhase === 'checking' && !view.stalled);
    const showCheck = view.canCheck || isCheckPending;
    const showUpdate = view.canUpdate || isStarting;

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Software Update</ItemCard.Title>
                <ItemCard.Description>
                    {view.detail ?? 'Check for and install the latest production release.'}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                {view.isUpdateActive ? (
                    <UpdateProgressBar label={view.label} progress={downloadProgress} />
                ) : (
                    <div className="flex items-center gap-2">
                        {/* An unreachable Computer still shows its control, disabled
                            and named for the reason, rather than an empty slot. */}
                        {view.canCheck || showCheck ? (
                            <Button
                                isDisabled={!view.canCheck}
                                isPending={isCheckPending}
                                onPress={onCheck}
                                size="sm"
                                variant="secondary"
                            >
                                Check
                            </Button>
                        ) : (
                            <Tooltip delay={0}>
                                <Tooltip.Trigger aria-label={view.label}>
                                    <span className="inline-flex cursor-not-allowed">
                                        <Button isDisabled size="sm" variant="secondary">
                                            {view.unconfirmed ? 'Unconfirmed' : 'Offline'}
                                        </Button>
                                    </span>
                                </Tooltip.Trigger>
                                <Tooltip.Content showArrow>
                                    <Tooltip.Arrow />
                                    <p className="max-w-xs">
                                        {view.unconfirmed
                                            ? 'Reconnect this Computer to confirm the installed version.'
                                            : 'Reconnect this Computer to check for updates.'}
                                    </p>
                                </Tooltip.Content>
                            </Tooltip>
                        )}
                        {showUpdate ? (
                            <Button
                                isDisabled={!view.canUpdate || isUpdateBlocked}
                                isPending={isStarting}
                                onPress={onUpdate}
                                size="sm"
                            >
                                {updateButtonLabel(computer.updateTargetVersion)}
                            </Button>
                        ) : null}
                    </div>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}

/** Re-renders when an active update crosses its unconfirmed or stalled bound. */
function useUpdateExpiryRefresh(computer: ComputerUpdateComputer) {
    const [, refreshTime] = useReducer((value: number) => value + 1, 0);
    const progress = {
        health: computer.health,
        phase: computer.updatePhase,
        updateUpdatedAt: computer.updateUpdatedAt,
    };
    const expiry = offlineComputerUpdateExpiry(progress) ?? stalledComputerUpdateExpiry(progress);
    useEffect(() => {
        if (expiry === null || expiry <= Date.now()) {
            return;
        }
        const timer = window.setTimeout(refreshTime, expiry - Date.now());
        return () => window.clearTimeout(timer);
    }, [expiry]);
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
