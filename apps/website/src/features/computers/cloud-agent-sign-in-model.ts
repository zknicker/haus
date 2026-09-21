import type { CloudAgentCapabilityState } from '@haus/api';

export type CloudAgentSignInView =
    | { status: 'starting' }
    | { status: 'waiting'; url: string }
    | { status: 'connected'; email: string | null }
    | { status: 'failed' | 'offline'; message: string };

export function cloudAgentSignInView({
    isOffline,
    isStarting,
    error,
    state,
}: {
    isOffline: boolean;
    isStarting: boolean;
    error: { message: string } | null;
    state: CloudAgentCapabilityState | null;
}): CloudAgentSignInView {
    if (isOffline) {
        return { status: 'offline', message: 'Reconnect this Computer to continue signing in.' };
    }
    if (isStarting) {
        return { status: 'starting' };
    }
    if (state?.signIn?.status === 'waiting') {
        return { status: 'waiting', url: state.signIn.url };
    }
    if (state?.signIn?.status === 'failed') {
        return { status: 'failed', message: state.signIn.message };
    }
    if (state?.ready) {
        return { status: 'connected', email: state.accountEmail };
    }
    if (error) {
        return { status: 'failed', message: error.message };
    }
    return { status: 'failed', message: 'Sign-in did not finish. Try again to get a new link.' };
}
