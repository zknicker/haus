import type {
    CloudAgentCapabilityState,
    CloudAgentEnvironment,
    CloudAgentProvider,
    ComputerInventory,
} from '@haus/api';
import { cloudAgentProviderName } from '../workers/cloud-agent-provider-presentation.ts';

export interface CloudAgentCapabilityView {
    canConnect: boolean;
    canDisconnect: boolean;
    connectLabel: string;
    detail: string | null;
    environmentId: string | null;
    environments: CloudAgentEnvironment[] | null;
    provider: CloudAgentProvider;
    providerName: string;
    status: 'connecting' | 'not-connected' | 'ready' | 'unavailable';
    statusLabel: string;
}

const providerAccess: Record<CloudAgentProvider, { connectLabel: string; notConnected: string }> = {
    claude: { connectLabel: 'Recheck', notConnected: 'Not signed in' },
    cursor: { connectLabel: 'Connect', notConnected: 'Not connected' },
};

export const claudeSignInGuidance =
    'Sign in to Claude Code on this device with your Claude account, then recheck.';

export function cloudAgentCapabilityView(input: {
    isConnecting: boolean;
    isOffline: boolean;
    provider: CloudAgentProvider;
    state: CloudAgentCapabilityState | null;
}): CloudAgentCapabilityView {
    const access = providerAccess[input.provider];
    const identity = {
        connectLabel: access.connectLabel,
        detail: null,
        environmentId: input.state?.environmentId ?? null,
        environments: input.state?.environments ?? null,
        provider: input.provider,
        providerName: cloudAgentProviderName(input.provider),
    };
    if (input.isOffline || !input.state) {
        return {
            ...identity,
            canConnect: false,
            canDisconnect: false,
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    if (input.isConnecting || input.state.signIn?.status === 'waiting') {
        return {
            ...identity,
            canConnect: !input.isConnecting,
            canDisconnect: false,
            status: 'connecting',
            statusLabel: input.isConnecting ? 'Connecting' : 'Awaiting sign-in',
        };
    }
    if (input.state.ready) {
        return {
            ...identity,
            canConnect: false,
            canDisconnect: input.provider === 'cursor',
            detail: input.provider === 'cursor' ? input.state.accountEmail : null,
            status: 'ready',
            statusLabel: 'Ready',
        };
    }
    if (input.state.reason === 'provider-unavailable') {
        return {
            ...identity,
            canConnect: input.provider === 'claude',
            canDisconnect: false,
            status: 'unavailable',
            statusLabel: 'Unavailable',
        };
    }
    return {
        ...identity,
        canConnect: true,
        canDisconnect: input.provider === 'cursor' && input.state.reason === 'expired',
        status: 'not-connected',
        statusLabel:
            input.state.signIn?.status === 'failed'
                ? 'Sign-in incomplete'
                : input.state.reason === 'expired'
                  ? 'Expired'
                  : access.notConnected,
    };
}

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
