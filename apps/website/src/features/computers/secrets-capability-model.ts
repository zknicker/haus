import type { ComputerSecretsStatus } from '@haus/api';

export interface SecretsCapabilityView {
    canConnect: boolean;
    canDisconnect: boolean;
    canRefresh: boolean;
    description: string;
    status: 'needs-attention' | 'not-connected' | 'ready' | 'unavailable';
    statusLabel: string;
}

/**
 * The Secrets row reads the Computer's own report (inventory `secrets`), so it
 * says what that machine holds rather than what this window assumes. Connect
 * and Refresh items need the desktop App: only desktop main can run the local
 * `op` CLI. Disconnect only tells the Computer to forget, so any window can.
 */
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
        };
        if (status.issue === 'runtime-missing') {
            return {
                ...actions,
                description: `Connected to “${status.vault.name}”, but this Computer could not set up Varlock, so Agents cannot use it yet. Refresh items to try again.`,
                status: 'needs-attention',
                statusLabel: 'Needs attention',
            };
        }
        return {
            ...actions,
            description: `Agents on this Computer can read “${status.vault.name}” (${items}) with haus-secrets.`,
            status: 'ready',
            statusLabel: 'Connected',
        };
    }
    const none = { canConnect: false, canDisconnect: false, canRefresh: false };
    if (input.isOffline || !status) {
        return {
            ...none,
            description: input.isOffline
                ? 'Reconnect this Computer to manage its secrets.'
                : 'Update this Computer to connect a 1Password vault.',
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    if (!input.canUseOnePassword) {
        return {
            ...none,
            description: 'Open Haus for Mac to connect a 1Password vault.',
            status: 'not-connected',
            statusLabel: 'Not connected',
        };
    }
    return {
        ...none,
        canConnect: true,
        description: 'Give Agents on this Computer read-only access to one 1Password vault.',
        status: 'not-connected',
        statusLabel: 'Not connected',
    };
}
