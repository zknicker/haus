import { hausReleaseDiscoverySchema } from '@haus/api';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useDesktopUpdate } from '../../hooks/desktop/use-desktop-update.ts';
import { useComputerPresenceCheck } from '../../hooks/servers/use-computer-presence-check.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useWebsiteUpdate } from '../../hooks/updates/use-website-update.ts';
import { gateComputersByPresence } from './computer-presence-gate.ts';
import { projectObservedUpdate } from './haus-update-observation.ts';
import { applyRunFailures } from './haus-update-run-failures.ts';
import { type HausUpdateObservations, useHausUpdateRun } from './use-haus-update-run.ts';
import { useOfflineComputers } from './use-offline-computers.ts';
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
    const release = useQuery({
        initialData: fallbackDiscovery,
        queryFn: fetchLatestRelease,
        queryKey: ['haus-release', 'latest'],
        refetchInterval: 10 * 60 * 1000,
        retry: 1,
        staleTime: 60 * 1000,
    });
    const observations = React.useRef<HausUpdateObservations>({
        computers: visibleComputers,
        desktop,
    });
    observations.current = { computers: visibleComputers, desktop };
    const sequenced = useHausUpdateRun({
        canOperate,
        canResume: canOperate && presence === 'verified',
        computers,
        discovery: release.data,
        observations,
        serverId,
    });

    const observedView = projectObservedUpdate({
        computers: visibleComputers,
        desktop,
        discovery: release.data,
    });
    const view = withWebsiteUpdate(
        applyRunFailures(observedView, sequenced.runResult),
        websiteUpdate
    );

    return {
        canOperate,
        isRunning: sequenced.isRunning,
        isSequencing: sequenced.isSequencing,
        isSettled: gatedComputers !== null,
        offlineComputers,
        releaseError: release.error,
        run: sequenced.run,
        runResult: sequenced.runResult,
        sequence: sequenced.sequence,
        view,
    };
}

async function fetchLatestRelease() {
    const response = await fetch(productionReleaseUrl);
    if (!response.ok) {
        throw new Error(`Haus update check failed (${response.status}).`);
    }
    return hausReleaseDiscoverySchema.parse(await response.json());
}
