import { Button, Tooltip } from '@heroui/react';
import {
    Alert01Icon,
    ComputerIcon,
    Download04Icon,
    ReloadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence } from 'motion/react';
import { Icon } from '../../components/ui/icon.tsx';
import { HausStatusEntrance } from './haus-status-entrance.tsx';
import {
    OfflineComputersTooltipContent,
    UpdateTooltipContent,
} from './haus-status-tooltip-content.tsx';
import { HausUpdateDonut, updateDonutStatus } from './haus-update-donut.tsx';
import type { HausUpdateView } from './haus-update-model.ts';
import type { HausUpdateSequence } from './haus-update-reconciler.ts';
import type { OfflineComputerNotice } from './use-offline-computers.ts';

export function HausUpdateFooter({
    isRunning = false,
    offlineComputers = [],
    onAction,
    onOpenComputer,
    sequence = null,
    view,
}: {
    isRunning?: boolean;
    offlineComputers?: readonly OfflineComputerNotice[];
    onAction?: (action: NonNullable<HausUpdateView['primaryAction']>) => void;
    onOpenComputer?: (computerId: string) => void;
    sequence?: HausUpdateSequence | null;
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
                                    sequence={sequence}
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
    sequence,
    view,
}: {
    isRunning: boolean;
    onAction?: (action: NonNullable<HausUpdateView['primaryAction']>) => void;
    sequence: HausUpdateSequence | null;
    view: HausUpdateView;
}) {
    const inactive = isRunning || view.phase === 'updating';
    const status = inactive ? updateDonutStatus(view, sequence) : null;
    return (
        <Tooltip closeDelay={0} delay={0}>
            <Tooltip.Trigger role="presentation" tabIndex={-1}>
                <Button
                    aria-label={status ? status.label : buttonLabel(view)}
                    className="haus-update-button"
                    isIconOnly
                    isPending={inactive}
                    onPress={() => {
                        if (!inactive && view.primaryAction) {
                            onAction?.(view.primaryAction);
                        }
                    }}
                    size="sm"
                    variant={view.phase === 'failed' ? 'danger-soft' : 'primary'}
                >
                    {status ? <HausUpdateDonut status={status} /> : <FooterMark view={view} />}
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
                className="tooltip--card haus-status-tooltip--contrast w-fit max-w-md p-3"
                offset={10}
                placement="top start"
            >
                <UpdateTooltipContent sequence={sequence} title={status?.label} view={view} />
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
                className="tooltip--card haus-status-tooltip--contrast w-fit min-w-72 p-3"
                offset={10}
                placement="top start"
            >
                <OfflineComputersTooltipContent computers={computers} />
            </Tooltip.Content>
        </Tooltip>
    );
}

function FooterMark({ view }: { view: HausUpdateView }) {
    switch (view.phase) {
        case 'available':
            return <Icon aria-hidden="true" icon={Download04Icon} />;
        case 'restart-required':
        case 'reload-required':
            return <Icon aria-hidden="true" icon={ReloadIcon} />;
        case 'failed':
            return <Icon aria-hidden="true" icon={Alert01Icon} />;
        case 'updating':
        case 'current':
            return null;
    }
}

function buttonLabel(view: HausUpdateView) {
    switch (view.phase) {
        case 'current':
            return 'Haus is up to date';
        case 'available':
            return `Update Haus to ${view.version}`;
        case 'updating':
            return 'Updating Haus';
        case 'restart-required':
            return 'Restart Haus to finish updating';
        case 'reload-required':
            return 'Update available. Reload Haus.';
        case 'failed':
            return `Haus update failed. ${view.detail}`;
    }
}
