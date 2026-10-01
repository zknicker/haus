import { hausReleaseDiscoverySchema } from '@haus/api';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useDesktopUpdate } from '../../hooks/desktop/use-desktop-update.ts';
import { useComputerPresenceCheck } from '../../hooks/servers/use-computer-presence-check.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useWebsiteUpdate } from '../../hooks/updates/use-website-update.ts';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ComputerUpdateComputer } from '../computers/computer-update-card.tsx';
import { computerLabel } from '../computers/presentation.ts';
import { gateComputersByPresence } from './computer-presence-gate.ts';
import type { HausUpdateComputer, HausUpdateDesktop, HausUpdateView } from './haus-update-model.ts';
import { projectHausUpdate } from './haus-update-model.ts';
import { createHausUpdateController, type HausUpdateRunResult } from './haus-update-reconciler.ts';
import { applyRunFailures } from './haus-update-run-failures.ts';
import { useOfflineComputers } from './use-offline-computers.ts';
import { waitForUpdateStepChange } from './wait-for-update-step.ts';
import { withWebsiteUpdate } from './website-update-model.ts';

const productionReleaseUrl = '/api/haus-release';
const fallbackDiscovery = {
    latest: import.meta.env.VITE_HAUS_RELEASE_SNAPSHOT,
    running: { agent: null, server: null },
};
const HausUpdateContext = React.createContext<ReturnType<typeof useHausUpdateState> | null>(null);

export function HausUpdateProvider({
    canOperate,
    children,
    serverId,
}: {
    canOperate: boolean;
    children: React.ReactNode;
    serverId: string;
}) {
    const value = useHausUpdateState(serverId, canOperate);
    return React.createElement(HausUpdateContext.Provider, { value }, children);
}

export function useHausUpdate() {
    const update = React.useContext(HausUpdateContext);
    if (!update) {
        throw new Error('useHausUpdate must be used inside HausUpdateProvider');
    }
    return update;
}

function useHausUpdateState(serverId: string, canOperate: boolean) {
    const websiteUpdate = useWebsiteUpdate();
    const computers = useComputers(serverId, { enabled: canOperate });
    const presence = useComputerPresenceCheck(serverId, { enabled: canOperate });
    const gatedComputers = canOperate
        ? gateComputersByPresence(presence, computers.data ?? [])
        : [];
    const visibleComputers = gatedComputers ?? [];
    const offlineComputers = useOfflineComputers(visibleComputers);
    const desktop = useDesktopUpdate();
    const updateComputer = hausTrpc.computer.update.useMutation();
    const release = useQuery({
        initialData: fallbackDiscovery,
        queryFn: fetchLatestRelease,
        queryKey: ['haus-release', 'latest'],
        refetchInterval: 10 * 60 * 1000,
        retry: 1,
        staleTime: 60 * 1000,
    });
    const [runResult, setRunResult] = React.useState<HausUpdateRunResult | null>(null);
    const [isRunning, setIsRunning] = React.useState(false);
    const activeRun = React.useRef<Promise<HausUpdateRunResult> | null>(null);
    const observations = React.useRef({ computers: visibleComputers, desktop });
    observations.current = { computers: visibleComputers, desktop };

    const observedView = projectObservedUpdate({
        computers: visibleComputers,
        desktop,
        discovery: release.data,
    });
    const view = withWebsiteUpdate(applyRunFailures(observedView, runResult), websiteUpdate);

    const run = React.useCallback(() => {
        if (activeRun.current) {
            return activeRun.current;
        }
        setRunResult(null);
        setIsRunning(true);
        const selectedDiscovery = release.data;
        const readView = () =>
            projectObservedUpdate({
                computers: observations.current.computers ?? [],
                desktop: observations.current.desktop,
                discovery: selectedDiscovery,
            });
        const controller = createHausUpdateController({
            downloadDesktop: async () => observations.current.desktop.updateAndRestart(),
            readView,
            restartDesktop: async () => observations.current.desktop.updateAndRestart(),
            updateComputer: async ({ computerId, targetVersion }) => {
                await updateComputer.mutateAsync({ computerId, serverId, targetVersion });
            },
            waitForChange: (step) =>
                waitForUpdateStepChange(step, {
                    readView,
                    refreshComputers: async () => {
                        // Parallel steps share one in-flight request instead of cancelling it.
                        const result = await computers.refetch({ cancelRefetch: false });
                        observations.current.computers = result.data ?? [];
                    },
                    sleep: wait,
                }),
        });
        const task = controller
            .run()
            .then((result) => {
                setRunResult(result);
                return result;
            })
            .catch((error: unknown) => {
                const result = {
                    failures: [
                        {
                            detail:
                                error instanceof Error ? error.message : 'Haus could not update.',
                            stepId: 'update-sequence',
                        },
                    ],
                    kind: 'failed',
                } as const;
                setRunResult(result);
                return result;
            })
            .finally(async () => {
                activeRun.current = null;
                setIsRunning(false);
                if (canOperate) {
                    await computers.refetch();
                }
            });
        activeRun.current = task;
        return task;
    }, [canOperate, computers, release.data, serverId, updateComputer]);

    return {
        canOperate,
        isRunning,
        isSettled: gatedComputers !== null,
        offlineComputers,
        releaseError: release.error,
        run,
        runResult,
        view,
    };
}

function projectObservedUpdate(input: {
    computers: readonly ComputerUpdateComputer[];
    desktop: ReturnType<typeof useDesktopUpdate>;
    discovery: import('@haus/api').HausReleaseDiscovery;
}): HausUpdateView {
    return projectHausUpdate({
        computers: input.computers.map(projectComputer),
        desktop: projectDesktop(input.desktop),
        release: input.discovery.latest,
    });
}

function projectComputer(computer: ComputerUpdateComputer): HausUpdateComputer {
    return {
        currentVersion: computer.productVersion,
        detail: computer.updateDetail,
        failedPhase: computer.updateFailedPhase,
        health: computer.health,
        id: computer.id,
        lastConnectedAt: computer.lastConnectedAt,
        name: computerLabel(computer),
        phase: computer.updatePhase,
        progress:
            computer.updateDownloadedBytes !== null &&
            computer.updateTotalBytes !== null &&
            computer.updateTotalBytes > 0
                ? computer.updateDownloadedBytes / computer.updateTotalBytes
                : null,
        reportedTargetVersion: computer.updateTargetVersion,
        updateUpdatedAt: computer.updateUpdatedAt,
    };
}

function projectDesktop(desktop: ReturnType<typeof useDesktopUpdate>): HausUpdateDesktop {
    if (!isElectronDesktopApp()) {
        return { kind: 'web' };
    }
    return {
        currentVersion: desktop.installedVersion,
        detail: desktop.status.phase === 'error' ? desktop.status.message : null,
        kind: 'desktop',
        phase: desktop.status.phase === 'unsupported' ? 'idle' : desktop.status.phase,
        progress: desktop.status.phase === 'downloading' ? desktop.status.progress : null,
    };
}

async function fetchLatestRelease() {
    const response = await fetch(productionReleaseUrl);
    if (!response.ok) {
        throw new Error(`Haus update check failed (${response.status}).`);
    }
    return hausReleaseDiscoverySchema.parse(await response.json());
}

function wait(milliseconds: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
