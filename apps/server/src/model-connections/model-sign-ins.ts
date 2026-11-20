import type {
    ModelSignIn,
    ModelSignInProvider,
    RunnerSignInCodeFrame,
    RunnerSignInFinishedFrame,
} from '@haus/api';
import { createOpaqueId } from '../postgres/opaque-id.ts';

const signInLifetimeMs = 15 * 60 * 1000;
const terminalStates = new Set<ModelSignIn['state']>(['cancelled', 'connected', 'failed']);

interface PendingSignIn {
    expiresAt: number;
    serverId: string;
    view: ModelSignIn;
}

type FailedResult = Extract<
    RunnerSignInFinishedFrame['result'],
    { status: 'cancelled' | 'failed' }
>;

export class ModelSignIns {
    private readonly pending = new Map<string, PendingSignIn>();

    start(serverId: string, provider: ModelSignInProvider, label: string) {
        const expiresAt = Date.now() + signInLifetimeMs;
        const signInId = createOpaqueId('msi');
        const view: ModelSignIn = {
            expiresAt: new Date(expiresAt).toISOString(),
            label,
            provider,
            signInId,
            state: 'waiting-for-code',
        };
        this.pending.set(signInId, { expiresAt, serverId, view });
        return view;
    }

    read(serverId: string, signInId: string) {
        const signIn = this.pending.get(signInId);
        return signIn?.serverId === serverId ? signIn.view : null;
    }

    inFlight(signInId: string) {
        const signIn = this.pending.get(signInId);
        return signIn && !terminalStates.has(signIn.view.state) ? signIn : null;
    }

    showCode(frame: RunnerSignInCodeFrame) {
        const signIn = this.inFlight(frame.signInId);
        if (!signIn) {
            return null;
        }
        signIn.view = {
            ...base(signIn.view),
            state: 'code',
            userCode: frame.userCode,
            verificationUri: frame.verificationUri,
        };
        return signIn.serverId;
    }

    connect(signInId: string, connectionId: string) {
        const signIn = this.pending.get(signInId);
        if (signIn) {
            signIn.view = { ...base(signIn.view), connectionId, state: 'connected' };
        }
    }

    end(signInId: string, result: FailedResult) {
        const signIn = this.inFlight(signInId);
        if (!signIn) {
            return null;
        }
        signIn.view =
            result.status === 'cancelled'
                ? { ...base(signIn.view), state: 'cancelled' }
                : { ...base(signIn.view), detail: result.detail, state: 'failed' };
        return signIn.serverId;
    }

    failInFlight(detail: string) {
        return [...this.pending.keys()].flatMap((signInId) => {
            const serverId = this.end(signInId, { detail, status: 'failed' });
            return serverId ? [{ serverId, signInId }] : [];
        });
    }

    sweep() {
        const now = Date.now();
        const expired: { serverId: string; signInId: string }[] = [];
        for (const [signInId, signIn] of this.pending) {
            if (now >= signIn.expiresAt + signInLifetimeMs) {
                this.pending.delete(signInId);
            } else if (now >= signIn.expiresAt && this.inFlight(signInId)) {
                this.end(signInId, { detail: 'The sign-in expired.', status: 'failed' });
                expired.push({ serverId: signIn.serverId, signInId });
            }
        }
        return expired;
    }
}

function base(view: ModelSignIn) {
    return {
        expiresAt: view.expiresAt,
        label: view.label,
        provider: view.provider,
        signInId: view.signInId,
    };
}
