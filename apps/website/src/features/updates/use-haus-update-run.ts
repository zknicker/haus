import type { HausReleaseDiscovery } from '@haus/api';
import * as React from 'react';
import type { useComputers } from '../../hooks/servers/use-computers.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ComputerUpdateComputer } from '../computers/computer-update-card.tsx';
import { type DesktopUpdateObservation, projectObservedUpdate } from './haus-update-observation.ts';
import {
    createHausUpdateController,
    type HausUpdateRunResult,
    type HausUpdateSequence,
} from './haus-update-reconciler.ts';
import { expectedComputerRestartMs } from './haus-update-timing.ts';
import { waitForUpdateStepChange } from './wait-for-update-step.ts';

export interface HausUpdateObservations {
    computers: readonly ComputerUpdateComputer[];
    desktop: DesktopUpdateObservation;
}

/**
 * Owns the sequenced update run one press starts, and the restart offer it
 * leaves when a downloaded App is waiting.
 */
export function useHausUpdateRun({
    canOperate,
    computers,
    discovery,
    observations,
    serverId,
}: {
    canOperate: boolean;
    computers: ReturnType<typeof useComputers>;
    discovery: HausReleaseDiscovery;
    observations: React.RefObject<HausUpdateObservations>;
    serverId: string;
}) {
    const updateComputer = hausTrpc.computer.update.useMutation();
    const [runResult, setRunResult] = React.useState<HausUpdateRunResult | null>(null);
    const [sequence, setSequence] = React.useState<HausUpdateSequence | null>(null);
    const [isRestartOffered, setRestartOffered] = React.useState(false);
    const activeRun = React.useRef<Promise<HausUpdateRunResult> | null>(null);

    const run = React.useCallback(() => {
        if (activeRun.current) {
            return activeRun.current;
        }
        setRunResult(null);
        setRestartOffered(false);
        setSequence({ activeStepId: null, stepIds: [] });
        const readView = () => projectObservedUpdate({ ...observations.current, discovery });
        const controller = createHausUpdateController({
            downloadDesktop: async () => observations.current.desktop.download(),
            onSequence: setSequence,
            readView,
            updateComputer: async ({ computerId, targetVersion }) => {
                // The Server fails an unanswered request on its own; never let a hung
                // request hold every later Computer in the sequence.
                await withTimeout(
                    updateComputer.mutateAsync({ computerId, serverId, targetVersion }),
                    expectedComputerRestartMs,
                    'Haus Computer did not answer the update request.'
                );
            },
            waitForChange: (step) =>
                waitForUpdateStepChange(step, {
                    readView,
                    refreshComputers: async () => {
                        const result = await computers.refetch({ cancelRefetch: false });
                        observations.current.computers = result.data ?? [];
                    },
                    sleep: wait,
                }),
        });
        const task = controller
            .run()
            .catch((error: unknown): HausUpdateRunResult => {
                const detail = error instanceof Error ? error.message : 'Haus could not update.';
                return {
                    appReady: false,
                    failures: [{ detail, stepId: 'update-sequence' }],
                    kind: 'failed',
                };
            })
            .then((result) => {
                setRunResult(result);
                setRestartOffered(result.appReady);
                return result;
            })
            .finally(async () => {
                activeRun.current = null;
                setSequence(null);
                if (canOperate) {
                    await computers.refetch();
                }
            });
        activeRun.current = task;
        return task;
    }, [canOperate, computers, discovery, observations, serverId, updateComputer]);

    const restartApp = React.useCallback(() => {
        setRestartOffered(false);
        return observations.current.desktop.restart();
    }, [observations]);

    return {
        dismissRestartOffer: React.useCallback(() => setRestartOffered(false), []),
        /** A run is active; other update starts must wait. */
        isRunning: sequence !== null,
        /** The pressed run ended with a downloaded App waiting to restart. */
        isRestartOffered,
        restartApp,
        run,
        runResult,
        sequence,
    };
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function wait(milliseconds: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
