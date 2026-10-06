import type { HausReleaseDiscovery } from '@haus/api';
import type { useDesktopUpdate } from '../../hooks/desktop/use-desktop-update.ts';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';
import type { ComputerUpdateComputer } from '../computers/computer-update-card.tsx';
import { computerLabel } from '../computers/presentation.ts';
import type { HausUpdateComputer, HausUpdateDesktop, HausUpdateView } from './haus-update-model.ts';
import { projectHausUpdate } from './haus-update-model.ts';

export type DesktopUpdateObservation = ReturnType<typeof useDesktopUpdate>;

/** Projects the App's live Computer and desktop observations onto one release. */
export function projectObservedUpdate(input: {
    computers: readonly ComputerUpdateComputer[];
    desktop: DesktopUpdateObservation;
    discovery: HausReleaseDiscovery;
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

function projectDesktop(desktop: DesktopUpdateObservation): HausUpdateDesktop {
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
