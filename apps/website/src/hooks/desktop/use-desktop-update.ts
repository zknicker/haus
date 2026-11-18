import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
    type DesktopUpdateBridgeStatus,
    getDesktopBridge,
    type HausDesktopBridge,
    isElectronDesktopApp,
} from '../../lib/desktop-bridge.ts';

export type DesktopUpdateStatus =
    | { phase: 'unsupported' }
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'current' }
    | { phase: 'available'; version: string }
    | { phase: 'downloading'; progress: number; version: string }
    | { phase: 'ready'; version: string }
    | { phase: 'restarting'; version: string }
    | { phase: 'error'; message: string };

let currentStatus: DesktopUpdateStatus = isElectronDesktopApp()
    ? { phase: 'idle' }
    : { phase: 'unsupported' };
let currentInstalledVersion: string | null = null;
let monitorStarted = false;
let activeTask: Promise<void> | null = null;

const listeners = new Set<() => void>();

export function useDesktopUpdate() {
    const status = useSyncExternalStore(subscribeDesktopUpdate, getDesktopUpdateSnapshot);
    const installedVersion = useSyncExternalStore(
        subscribeDesktopUpdate,
        getDesktopInstalledVersionSnapshot
    );

    useEffect(() => {
        startDesktopUpdateMonitor();
    }, []);

    const checkForUpdate = useCallback(async () => {
        await checkForDesktopUpdate();
    }, []);

    return {
        checkForUpdate,
        download: downloadDesktopUpdate,
        installedVersion,
        restart: restartForDesktopUpdate,
        status,
    };
}

function startDesktopUpdateMonitor() {
    const bridge = getDesktopBridge();

    if (monitorStarted || !bridge) {
        return;
    }

    monitorStarted = true;
    bridge.onUpdateStatus((status) => {
        setDesktopUpdateStatus(
            reconcileDesktopUpdateStatus(currentStatus, fromBridgeStatus(status))
        );
    });
    void readDesktopInstalledVersion(bridge).then(setDesktopInstalledVersion, () => {
        setDesktopInstalledVersion(null);
    });
    void checkForDesktopUpdate();
}

function subscribeDesktopUpdate(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getDesktopUpdateSnapshot() {
    return currentStatus;
}

function getDesktopInstalledVersionSnapshot() {
    return currentInstalledVersion;
}

function setDesktopUpdateStatus(status: DesktopUpdateStatus) {
    currentStatus = status;

    notifyDesktopUpdateListeners();
}

function setDesktopInstalledVersion(version: string | null) {
    currentInstalledVersion = version;

    notifyDesktopUpdateListeners();
}

function notifyDesktopUpdateListeners() {
    for (const listener of listeners) {
        listener();
    }
}

export async function readDesktopInstalledVersion(
    bridge: Pick<HausDesktopBridge, 'getInfo'> | null
) {
    if (!bridge) {
        return null;
    }

    const info = await bridge.getInfo();
    return info.version;
}

async function checkForDesktopUpdate() {
    const bridge = getDesktopBridge();

    if (!bridge) {
        setDesktopUpdateStatus({ phase: 'unsupported' });
        return;
    }

    if (isPersistentUpdateStatus(currentStatus)) {
        return;
    }

    if (activeTask) {
        await activeTask;
        return;
    }

    setDesktopUpdateStatus({ phase: 'checking' });

    activeTask = checkForDesktopUpdateTask().finally(() => {
        activeTask = null;
    });

    await activeTask;
}

async function checkForDesktopUpdateTask() {
    const bridge = getDesktopBridge();

    if (!bridge) {
        setDesktopUpdateStatus({ phase: 'unsupported' });
        return;
    }

    try {
        await bridge.checkForUpdate();
    } catch (error) {
        setDesktopUpdateStatus({
            phase: 'error',
            message: getErrorMessage(error, 'Haus could not check for updates.'),
        });
    }
}

/** Downloads an available update without restarting; a ready update stays ready. */
async function downloadDesktopUpdate() {
    // checkForDesktopUpdate reports an unsupported App itself.
    if (!isPersistentUpdateStatus(readDesktopUpdateStatus())) {
        await checkForDesktopUpdate();
    }
    if (readDesktopUpdateStatus().phase === 'available') {
        await downloadAvailableDesktopUpdate();
    }
}

/** Restarts into a downloaded update; any other state has nothing to restart. */
async function restartForDesktopUpdate() {
    const bridge = getDesktopBridge();
    const status = readDesktopUpdateStatus();
    if (!bridge || status.phase !== 'ready') {
        return;
    }
    setDesktopUpdateStatus({ phase: 'restarting', version: status.version });
    try {
        await bridge.restartForUpdate();
    } catch (error) {
        setDesktopUpdateStatus({
            phase: 'error',
            message: getErrorMessage(error, 'Haus could not restart to finish updating.'),
        });
    }
}

// Read through a call so TypeScript does not carry narrowing across awaits.
function readDesktopUpdateStatus() {
    return currentStatus;
}

async function downloadAvailableDesktopUpdate() {
    const bridge = getDesktopBridge();

    if (!bridge || currentStatus.phase !== 'available') {
        return;
    }

    const version = currentStatus.version;
    setDesktopUpdateStatus({ phase: 'downloading', progress: 0, version });

    try {
        await bridge.downloadUpdate();
    } catch (error) {
        setDesktopUpdateStatus({
            phase: 'error',
            message: getErrorMessage(error, 'Haus could not download the update.'),
        });
    }
}

export function isPersistentUpdateStatus(status: DesktopUpdateStatus) {
    return (
        status.phase === 'available' ||
        status.phase === 'downloading' ||
        status.phase === 'ready' ||
        status.phase === 'restarting'
    );
}

export function canCheckForDesktopUpdate(status: DesktopUpdateStatus) {
    return status.phase === 'idle' || status.phase === 'current' || status.phase === 'error';
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error) {
        return error;
    }

    return fallback;
}

function fromBridgeStatus(status: DesktopUpdateBridgeStatus): DesktopUpdateStatus {
    return status;
}

export function reconcileDesktopUpdateStatus(
    current: DesktopUpdateStatus,
    incoming: DesktopUpdateStatus
): DesktopUpdateStatus {
    if (current.phase === 'downloading' && incoming.phase === 'downloading') {
        return { ...incoming, version: current.version };
    }

    return incoming;
}
