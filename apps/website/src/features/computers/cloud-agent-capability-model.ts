import type { CloudAgentCapabilityState, CloudAgentProvider, ComputerInventory } from '@haus/api';
import { cloudAgentProviderName } from '../cloud-agents/cloud-agent-provider-presentation.ts';

export interface CloudAgentCapabilityView {
    canConnect: boolean;
    canDisconnect: boolean;
    /** Only a ready provider that is not already the default can become it. */
    canMakeDefault: boolean;
    /** Cursor signs in from Haus; Claude reuses the Computer's own Claude Code login. */
    connectLabel: string;
    description: string;
    isDefault: boolean;
    provider: CloudAgentProvider;
    providerName: string;
    status: 'connecting' | 'not-connected' | 'ready' | 'unavailable';
    statusLabel: string;
}

/** How each provider is signed in to and what an unconnected row tells a human. */
const providerAccess: Record<
    CloudAgentProvider,
    { connectLabel: string; missing: string; notConnected: string; plan: string }
> = {
    claude: {
        connectLabel: 'Check again',
        missing: 'Install Claude Code on this Computer to use Claude cloud agents.',
        notConnected:
            'Sign in to Claude Code on this Computer with your Claude account, then check again.',
        plan: 'Claude cloud sessions bill to that Claude plan.',
    },
    cursor: {
        connectLabel: 'Connect',
        missing: 'This Computer cannot reach Cursor’s Cloud Agents.',
        notConnected:
            'Connect this Computer to Cursor so Agents can delegate work to Cloud Agents.',
        plan: 'Cloud Agent work bills to that Cursor plan.',
    },
};

/**
 * The Cloud Agent capability row reads from the Computer's own report, so it
 * says what that machine can actually do rather than what this browser
 * assumes. Computer owns the ongoing sign-in so reloading Settings keeps it.
 */
export function cloudAgentCapabilityView(input: {
    isConnecting: boolean;
    isOffline: boolean;
    provider: CloudAgentProvider;
    state: CloudAgentCapabilityState | null;
}): CloudAgentCapabilityView {
    const access = providerAccess[input.provider];
    const identity = {
        canMakeDefault: false,
        connectLabel: access.connectLabel,
        isDefault: input.state?.isDefault ?? false,
        provider: input.provider,
        providerName: cloudAgentProviderName(input.provider),
    };
    if (input.isOffline || !input.state) {
        return {
            ...identity,
            canConnect: false,
            canDisconnect: false,
            description: 'Reconnect this Computer to manage its Cloud Agent access.',
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    if (input.isConnecting || input.state.signIn?.status === 'waiting') {
        return {
            ...identity,
            canConnect: !input.isConnecting,
            canDisconnect: false,
            description: input.isConnecting
                ? 'Preparing your sign-in link…'
                : `Finish signing in to ${identity.providerName} on this device. Haus will connect automatically.`,
            status: 'connecting',
            statusLabel: input.isConnecting ? 'Connecting' : 'Awaiting sign-in',
        };
    }
    if (input.state.ready) {
        return {
            ...identity,
            canConnect: false,
            // Haus never signs Claude Code out; that login belongs to the Computer.
            canDisconnect: input.provider === 'cursor',
            canMakeDefault: !identity.isDefault,
            description: connectedDescription(input.state, access.plan),
            status: 'ready',
            statusLabel: 'Ready',
        };
    }
    if (input.state.reason === 'provider-unavailable') {
        return {
            ...identity,
            canConnect: input.provider === 'claude',
            canDisconnect: false,
            description: access.missing,
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    return {
        ...identity,
        canConnect: true,
        canDisconnect: input.provider === 'cursor' && input.state.reason === 'expired',
        description:
            input.state.signIn?.status === 'failed'
                ? input.state.signIn.message
                : input.state.reason === 'expired'
                  ? `This Computer’s ${identity.providerName} key expired. Connect again to renew it.`
                  : access.notConnected,
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
    inventory: ComputerInventory | null,
    provider: CloudAgentProvider
): CloudAgentCapabilityState | null {
    const reported = inventory?.cloudAgentProviders?.find(
        (candidate) => candidate.provider === provider
    );
    if (!reported) {
        return null;
    }
    return {
        accountEmail: null,
        expiresAt: null,
        isDefault: reported.isDefault,
        provider: reported.provider,
        ready: reported.ready,
        reason: reported.ready ? null : (reported.reason ?? 'provider-unavailable'),
    };
}

function connectedDescription(state: CloudAgentCapabilityState, plan: string): string {
    const account = state.accountEmail ? `Connected as ${state.accountEmail}.` : 'Connected.';
    const assignment = 'Agents assigned to this Computer use this connection.';
    if (!state.expiresAt) {
        return `${account} ${assignment} ${plan}`;
    }
    return `${account} ${assignment} Reconnect by ${new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
    }).format(new Date(state.expiresAt))}.`;
}
