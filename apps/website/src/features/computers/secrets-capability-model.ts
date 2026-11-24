import type { ComputerSecretsStatus } from '@haus/api';

export interface SecretsCapabilityView {
    canConnect: boolean;
    canDisconnect: boolean;
    canRefresh: boolean;
    detail: string | null;
    status: 'needs-attention' | 'not-connected' | 'ready' | 'unavailable';
    statusLabel: string;
}

export function secretsCapabilityView(input: {
    canUseOnePassword: boolean;
    isOffline: boolean;
    status: ComputerSecretsStatus | null;
}): SecretsCapabilityView {
    const { status } = input;
    if (status?.connected) {
        const manageable = !input.isOffline;
        const items = status.items.length === 1 ? '1 item' : `${status.items.length} items`;
        const actions = {
            canConnect: false,
            canDisconnect: manageable,
            canRefresh: manageable && input.canUseOnePassword,
            detail: `“${status.vault.name}” · ${items}`,
        };
        if (status.issue === 'runtime-missing') {
            return { ...actions, status: 'needs-attention', statusLabel: 'Needs attention' };
        }
        if (status.issue === 'keychain-locked') {
            return { ...actions, status: 'needs-attention', statusLabel: 'Keychain locked' };
        }
        return { ...actions, status: 'ready', statusLabel: 'Connected' };
    }
    const none = { canConnect: false, canDisconnect: false, canRefresh: false, detail: null };
    if (input.isOffline || !status) {
        return {
            ...none,
            status: 'unavailable',
            statusLabel: input.isOffline ? 'Unavailable' : 'Update needed',
        };
    }
    if (!input.canUseOnePassword) {
        return { ...none, status: 'not-connected', statusLabel: 'Connect in Haus for Mac' };
    }
    return { ...none, canConnect: true, status: 'not-connected', statusLabel: 'Not connected' };
}
