import type {
    AgentRuntimeBrowserConnection,
    AgentRuntimeBrowserSettings,
    AgentRuntimeSaveBrowserSettings,
} from '@haus/api';

export interface BrowserSettingsDraft {
    connection: AgentRuntimeBrowserConnection | null;
    enabled: boolean;
}

export function createDraft(settings: AgentRuntimeBrowserSettings | null): BrowserSettingsDraft {
    const available = settings?.browsers.find((browser) => browser.available);
    return {
        enabled: settings?.configured ? settings.enabled : true,
        connection:
            settings?.connection ??
            (available
                ? { applicationPath: available.applicationPath, userDataDir: available.userDataDir }
                : null),
    };
}

export function toSaveInput(
    settings: AgentRuntimeBrowserSettings,
    draft: BrowserSettingsDraft
): AgentRuntimeSaveBrowserSettings {
    const changed = JSON.stringify(draft.connection) !== JSON.stringify(settings.connection);
    return {
        enabled: draft.enabled,
        ...(changed && draft.connection ? { connection: draft.connection } : {}),
    };
}

export function hasDraftChanges(
    settings: AgentRuntimeBrowserSettings,
    draft: BrowserSettingsDraft
) {
    return (
        draft.enabled !== settings.enabled ||
        JSON.stringify(draft.connection) !== JSON.stringify(settings.connection)
    );
}

export function draftError(
    settings: AgentRuntimeBrowserSettings,
    draft: BrowserSettingsDraft
): string | null {
    if (!draft.enabled) {
        return null;
    }
    const connection = draft.connection;
    if (!connection) {
        return 'Select a running browser before connecting.';
    }
    return settings.browsers.some(
        (browser) =>
            browser.available &&
            browser.applicationPath === connection.applicationPath &&
            browser.userDataDir === connection.userDataDir
    )
        ? null
        : 'Start this browser with its current owner, then refresh.';
}
