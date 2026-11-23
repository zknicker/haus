import type { AgentRuntimeBrowserSettings } from '@haus/api';

export type BrowserCapabilityStatus =
    | 'attention'
    | 'checking'
    | 'not-configured'
    | 'off'
    | 'ready'
    | 'unavailable';
export interface BrowserCapabilityView {
    canConfigure: boolean;
    canDisable: boolean;
    canEnable: boolean;
    description: string;
    status: BrowserCapabilityStatus;
    statusLabel: string;
}

/** While the device answers, the row is already the row it will be, with nothing to press yet. */
export const browserCheckingView: BrowserCapabilityView = {
    canConfigure: false,
    canDisable: false,
    canEnable: false,
    description: 'Asking this device about its Chrome.',
    status: 'checking',
    statusLabel: 'Checking',
};

export function browserCapabilityView({
    error,
    settings,
}: {
    error?: string | null;
    settings: AgentRuntimeBrowserSettings | null;
}): BrowserCapabilityView {
    if (!settings) {
        return {
            canConfigure: false,
            canDisable: false,
            canEnable: false,
            description: error ?? 'Reconnect this device to configure its Browser.',
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    const selected = settings.browsers.find(
        (browser) =>
            browser.userDataDir === settings.connection?.userDataDir &&
            browser.applicationPath === settings.connection.applicationPath
    );
    const actions = {
        canConfigure: true,
        canDisable: settings.enabled,
        canEnable: settings.configured && !settings.enabled && Boolean(selected?.available),
    };
    if (!settings.configured) {
        return {
            ...actions,
            description:
                'Connect Captains to an existing automation-enabled Chrome on this device.',
            status: 'not-configured',
            statusLabel: 'Not configured',
        };
    }
    if (!settings.enabled) {
        return {
            ...actions,
            description:
                'Haus is disconnected. Chrome and its profile stay with their current owner.',
            status: 'off',
            statusLabel: 'Disconnected',
        };
    }
    if (settings.status?.state !== 'healthy') {
        return {
            ...actions,
            description:
                settings.status?.reason ??
                'The selected browser is unavailable. Start it with its current owner, then refresh.',
            status: 'attention',
            statusLabel: 'Unavailable',
        };
    }
    return {
        ...actions,
        description: `Captains share ${selected?.name ?? 'the selected Chrome browser'} and its signed-in accounts. Disconnecting Haus leaves Chrome open.`,
        status: 'ready',
        statusLabel: 'Connected',
    };
}
