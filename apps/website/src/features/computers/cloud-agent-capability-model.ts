import type { CloudAgentCapabilityState, ComputerInventory } from '@haus/api';

export interface CloudAgentCapabilityView {
    canConnect: boolean;
    canDisconnect: boolean;
    description: string;
    status: 'connecting' | 'not-connected' | 'ready' | 'unavailable';
    statusLabel: string;
}

/**
 * The Cloud Agent capability row reads from the Computer's own report, so it
 * says what that machine can actually do rather than what this browser
 * assumes. Computer owns the ongoing sign-in so reloading Settings keeps it.
 */
export function cloudAgentCapabilityView(input: {
    isConnecting: boolean;
    isOffline: boolean;
    state: CloudAgentCapabilityState | null;
}): CloudAgentCapabilityView {
    if (input.isOffline || !input.state) {
        return {
            canConnect: false,
            canDisconnect: false,
            description: 'Reconnect this Computer to manage its Cloud Agent access.',
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    if (input.isConnecting || input.state.signIn?.status === 'waiting') {
        return {
            canConnect: !input.isConnecting,
            canDisconnect: false,
            description: input.isConnecting
                ? 'Preparing your sign-in link…'
                : 'Finish signing in to Cursor on this device. Haus will connect automatically.',
            status: 'connecting',
            statusLabel: input.isConnecting ? 'Connecting' : 'Awaiting sign-in',
        };
    }
    if (input.state.ready) {
        return {
            canConnect: false,
            canDisconnect: true,
            description: connectedDescription(input.state),
            status: 'ready',
            statusLabel: 'Ready',
        };
    }
    if (input.state.reason === 'provider-unavailable') {
        return {
            canConnect: false,
            canDisconnect: false,
            description: 'This Computer cannot reach Cursor’s Cloud Agents.',
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    return {
        canConnect: true,
        canDisconnect: input.state.reason === 'expired',
        description:
            input.state.signIn?.status === 'failed'
                ? input.state.signIn.message
                : input.state.reason === 'expired'
                  ? 'This Computer’s Cursor key expired. Connect again to renew it.'
                  : 'Connect this Computer to Cursor so Agents can delegate work to Cloud Agents.',
        status: 'not-connected',
        statusLabel:
            input.state.signIn?.status === 'failed'
                ? 'Sign-in incomplete'
                : input.state.reason === 'expired'
                  ? 'Expired'
                  : 'Not connected',
    };
}

/**
 * The readiness line the Computer already reports in its inventory. It renders
 * the row before the settings read answers, and keeps it truthful while a
 * Computer is offline and the read cannot run at all.
 */
export function reportedCloudAgentCapability(
    inventory: ComputerInventory | null
): CloudAgentCapabilityState | null {
    const reported = inventory?.cloudAgentProviders?.find(
        (candidate) => candidate.provider === 'cursor'
    );
    if (!reported) {
        return null;
    }
    return {
        accountEmail: null,
        expiresAt: null,
        provider: reported.provider,
        ready: reported.ready,
        reason: reported.ready ? null : (reported.reason ?? 'provider-unavailable'),
    };
}

function connectedDescription(state: CloudAgentCapabilityState): string {
    const account = state.accountEmail ? `Connected as ${state.accountEmail}.` : 'Connected.';
    const assignment = 'Agents assigned to this Computer use this connection.';
    if (!state.expiresAt) {
        return `${account} ${assignment} Cloud Agent work bills to that Cursor plan.`;
    }
    return `${account} ${assignment} Reconnect by ${new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
    }).format(new Date(state.expiresAt))}.`;
}
