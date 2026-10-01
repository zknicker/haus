import { Button, Tooltip } from '@heroui/react';
import {
    Alert01Icon,
    ComputerIcon,
    Download04Icon,
    ReloadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence } from 'motion/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { HausStatusEntrance } from './haus-status-entrance.tsx';
import {
    OfflineComputersTooltipContent,
    UpdateTooltipContent,
} from './haus-status-tooltip-content.tsx';
import { HausUpdateDonut } from './haus-update-donut.tsx';
import type { HausUpdateView } from './haus-update-model.ts';
import { isActiveUpdateStep } from './haus-update-model.ts';
import { selectHausUpdateBatch } from './haus-update-reconciler.ts';
import type { OfflineComputerNotice } from './use-offline-computers.ts';

export function HausUpdateFooter({
    isRunning = false,
    offlineComputers = [],
    onAction,
    onOpenComputer,
    view,
}: {
    isRunning?: boolean;
    offlineComputers?: readonly OfflineComputerNotice[];
    onAction?: (action: NonNullable<HausUpdateView['primaryAction']>) => void;
    onOpenComputer?: (computerId: string) => void;
    view: HausUpdateView;
}) {
    const showUpdate = view.phase !== 'current';
    const showOffline = offlineComputers.length > 0;
    // The inner presence propagates, so the section outlives its last button's exit.
    return (
        <AnimatePresence>
            {showUpdate || showOffline ? (
                <section
                    aria-label="Haus status"
                    aria-live="polite"
                    className="flex w-full items-center gap-2"
                    key="haus-status"
                >
                    <AnimatePresence propagate>
                        {showUpdate ? (
                            <HausStatusEntrance key="update">
                                <UpdateTooltipButton
                                    isRunning={isRunning}
                                    onAction={onAction}
                                    view={view}
                                />
                            </HausStatusEntrance>
                        ) : null}
                        {showOffline ? (
                            <HausStatusEntrance key="offline">
                                <OfflineComputersButton
                                    computers={offlineComputers}
                                    onOpenComputer={onOpenComputer}
                                />
                            </HausStatusEntrance>
                        ) : null}
                    </AnimatePresence>
                </section>
            ) : null}
        </AnimatePresence>
    );
}

function UpdateTooltipButton({
    isRunning,
    onAction,
    view,
}: {
    isRunning: boolean;
    onAction?: (action: NonNullable<HausUpdateView['primaryAction']>) => void;
    view: HausUpdateView;
}) {
    const inactive = isRunning || view.phase === 'updating';
    const [batchStepIds, setBatchStepIds] = React.useState<readonly string[] | null>(null);
    if (!inactive && batchStepIds !== null) {
        // The pressed batch settled; later progress draws from live steps only.
        setBatchStepIds(null);
    }
    const progressSteps = donutSteps(view.steps, batchStepIds);
    return (
        <Tooltip closeDelay={0} delay={0}>
            <Tooltip.Trigger role="presentation" tabIndex={-1}>
                <Button
                    aria-label={buttonLabel(view)}
                    className="haus-update-button"
                    isIconOnly
                    isPending={inactive}
                    onPress={() => {
                        if (!inactive && view.primaryAction) {
                            setBatchStepIds(
                                selectHausUpdateBatch(view.steps).map((step) => step.id)
                            );
                            onAction?.(view.primaryAction);
                        }
                    }}
                    size="sm"
                    variant={view.phase === 'failed' ? 'danger-soft' : 'primary'}
                >
                    <FooterMark progressSteps={progressSteps} view={view} />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
                className="haus-status-tooltip--contrast w-fit max-w-md p-3"
                offset={10}
                placement="top start"
            >
                <UpdateTooltipContent view={view} />
            </Tooltip.Content>
        </Tooltip>
    );
}

function OfflineComputersButton({
    computers,
    onOpenComputer,
}: {
    computers: readonly OfflineComputerNotice[];
    onOpenComputer?: (computerId: string) => void;
}) {
    const noun = computers.length === 1 ? 'Computer is' : 'Computers are';
    return (
        <Tooltip closeDelay={0} delay={0}>
            <Tooltip.Trigger role="presentation" tabIndex={-1}>
                <Button
                    aria-label={`${computers.length} ${noun} offline`}
                    className="haus-offline-button"
                    isIconOnly
                    onPress={() => {
                        const first = computers[0];
                        if (first) {
                            onOpenComputer?.(first.id);
                        }
                    }}
                    size="sm"
                    variant="secondary"
                >
                    <Icon aria-hidden="true" icon={ComputerIcon} />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
                className="haus-status-tooltip--contrast w-fit min-w-72 p-3"
                offset={10}
                placement="top start"
            >
                <OfflineComputersTooltipContent computers={computers} />
            </Tooltip.Content>
        </Tooltip>
    );
}

function FooterMark({
    progressSteps,
    view,
}: {
    progressSteps: HausUpdateView['steps'];
    view: HausUpdateView;
}) {
    switch (view.phase) {
        case 'updating':
            return <HausUpdateDonut steps={progressSteps} />;
        case 'available':
            return <Icon aria-hidden="true" icon={Download04Icon} />;
        case 'restart-required':
        case 'reload-required':
            return <Icon aria-hidden="true" icon={ReloadIcon} />;
        case 'failed':
            return <Icon aria-hidden="true" icon={Alert01Icon} />;
        case 'current':
            return null;
    }
}

/** Donut segments: the pressed batch while it runs, otherwise the live active steps. */
export function donutSteps(
    steps: HausUpdateView['steps'],
    batchStepIds: readonly string[] | null
): HausUpdateView['steps'] {
    return batchStepIds === null
        ? steps.filter(isActiveUpdateStep)
        : steps.filter((step) => batchStepIds.includes(step.id));
}

function buttonLabel(view: HausUpdateView) {
    switch (view.phase) {
        case 'current':
            return 'Haus is up to date';
        case 'available':
            return `Update Haus to ${view.version}`;
        case 'updating':
            return `Updating Haus. ${view.detail}`;
        case 'restart-required':
            return 'Restart Haus to finish updating';
        case 'reload-required':
            return 'Update available. Reload Haus.';
        case 'failed':
            return `Haus update failed. ${view.detail}`;
    }
}
