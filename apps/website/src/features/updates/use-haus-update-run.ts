import type { HausReleaseDiscovery } from '@haus/api';
import * as React from 'react';
import type { useComputers } from '../../hooks/servers/use-computers.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ComputerUpdateComputer } from '../computers/computer-update-card.tsx';
import {
    forgetHausUpdateContinuation,
    readHausUpdateContinuation,
    rememberHausUpdateContinuation,
    takeHausUpdateContinuation,
} from './haus-update-continuation.ts';
import { type DesktopUpdateObservation, projectObservedUpdate } from './haus-update-observation.ts';
import {
    createHausUpdateController,
    type HausUpdateResume,
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
 * Owns the sequenced update run: one press, or the automatic resume of
 * Computers a press still owed when it restarted the App.
 */
export function useHausUpdateRun({
    canOperate,
    canResume,
    computers,
    discovery,
    observations,
    serverId,
}: {
    canOperate: boolean;
    /** True once this session has verified which Computers answer. */
    canResume: boolean;
    computers: ReturnType<typeof useComputers>;
    discovery: HausReleaseDiscovery;
    observations: React.RefObject<HausUpdateObservations>;
    serverId: string;
}) {
    const updateComputer = hausTrpc.computer.update.useMutation();
    const [runResult, setRunResult] = React.useState<HausUpdateRunResult | null>(null);
    const [sequence, setSequence] = React.useState<HausUpdateSequence | null>(null);
    const activeRun = React.useRef<Promise<HausUpdateRunResult> | null>(null);
    const resumeChecked = React.useRef<string | null>(null);

    const run = React.useCallback(
        (resume?: HausUpdateResume) => {
            if (activeRun.current) {
                return activeRun.current;
            }
            setRunResult(null);
            setSequence({ activeStepId: null, stepIds: [] });
            const readView = () => projectObservedUpdate({ ...observations.current, discovery });
            const controller = createHausUpdateController({
                downloadDesktop: async () => observations.current.desktop.updateAndRestart(),
                forgetPendingComputers: () => forgetHausUpdateContinuation(),
                onSequence: setSequence,
                readView,
                rememberPendingComputers: (computerIds) =>
                    rememberHausUpdateContinuation({ computerIds, serverId }),
                restartDesktop: async () => observations.current.desktop.updateAndRestart(),
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
                .run(resume)
                .catch((error: unknown): HausUpdateRunResult => {
                    const detail =
                        error instanceof Error ? error.message : 'Haus could not update.';
                    return { failures: [{ detail, stepId: 'update-sequence' }], kind: 'failed' };
                })
                .then((result) => {
                    setRunResult(result);
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
        },
        [canOperate, computers, discovery, observations, serverId, updateComputer]
    );

    React.useEffect(() => {
        if (!canResume || resumeChecked.current === serverId) {
            return;
        }
        resumeChecked.current = serverId;
        const continuation = takeHausUpdateContinuation(serverId);
        if (continuation) {
            void run({ computerIds: continuation.computerIds });
        }
    }, [canResume, run, serverId]);

    return {
        isRunning: sequence !== null,
        /** A run is active or a relaunch still owes one; other update starts must wait. */
        isSequencing: sequence !== null || readHausUpdateContinuation(serverId) !== null,
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
