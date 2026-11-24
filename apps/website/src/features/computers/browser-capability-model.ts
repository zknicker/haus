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
    detail: string | null;
    status: BrowserCapabilityStatus;
    statusLabel: string;
}

export const browserCheckingView: BrowserCapabilityView = {
    canConfigure: false,
    canDisable: false,
    canEnable: false,
    detail: null,
    status: 'checking',
    statusLabel: 'Checking',
};

export function browserCapabilityView({
    settings,
}: {
    settings: AgentRuntimeBrowserSettings | null;
}): BrowserCapabilityView {
    if (!settings) {
        return {
            canConfigure: false,
            canDisable: false,
            canEnable: false,
            detail: null,
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
        detail: null,
    };
    if (!settings.configured) {
        return { ...actions, status: 'not-configured', statusLabel: 'Not configured' };
    }
    if (!settings.enabled) {
        return { ...actions, status: 'off', statusLabel: 'Disconnected' };
    }
    if (settings.status?.state !== 'healthy') {
        return { ...actions, status: 'attention', statusLabel: 'Unavailable' };
    }
    return {
        ...actions,
        detail: selected?.name ?? null,
        status: 'ready',
        statusLabel: 'Connected',
    };
}
