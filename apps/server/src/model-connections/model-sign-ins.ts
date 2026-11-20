import type {
    ModelSignIn,
    ModelSignInCancelResult,
    ModelSignInProvider,
    RunnerSignInCodeFrame,
    RunnerSignInFinishedFrame,
} from '@haus/api';
import { createOpaqueId } from '../postgres/opaque-id.ts';

const signInLifetimeMs = 15 * 60 * 1000;
const runnerStates = new Set<ModelSignIn['state']>(['waiting-for-code', 'code']);

interface PendingSignIn {
    expiresAt: number;
    replaceConnectionId: string | null;
    serverId: string;
    view: ModelSignIn;
}

type FailedResult = Extract<
    RunnerSignInFinishedFrame['result'],
    { status: 'cancelled' | 'failed' }
>;

export class ModelSignIns {
    private readonly pending = new Map<string, PendingSignIn>();

    start(
        serverId: string,
        provider: ModelSignInProvider,
        label: string,
        replaceConnectionId: string | null
    ) {
        const expiresAt = Date.now() + signInLifetimeMs;
        const signInId = createOpaqueId('msi');
        const view: ModelSignIn = {
            expiresAt: new Date(expiresAt).toISOString(),
            label,
            provider,
            signInId,
            state: 'waiting-for-code',
        };
        this.pending.set(signInId, { expiresAt, replaceConnectionId, serverId, view });
        return view;
    }

    read(serverId: string, signInId: string) {
        const signIn = this.pending.get(signInId);
        return signIn?.serverId === serverId ? signIn.view : null;
    }

    showCode(frame: RunnerSignInCodeFrame) {
        const signIn = this.onRunner(frame.signInId);
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

    beginStoring(signInId: string) {
        const signIn = this.onRunner(signInId);
        if (!signIn || Date.now() >= signIn.expiresAt) {
            return null;
        }
        signIn.view = { ...base(signIn.view), state: 'storing' };
        return {
            replaceConnectionId: signIn.replaceConnectionId,
            serverId: signIn.serverId,
            view: signIn.view,
        };
    }

    settle(signInId: string, outcome: { connectionId: string } | { detail: string }) {
        const signIn = this.pending.get(signInId);
        if (signIn?.view.state !== 'storing') {
            return;
        }
        signIn.view =
            'connectionId' in outcome
                ? { ...base(signIn.view), connectionId: outcome.connectionId, state: 'connected' }
                : { ...base(signIn.view), detail: outcome.detail, state: 'failed' };
    }

    cancel(serverId: string, signInId: string) {
        const signIn = this.pending.get(signInId);
        if (signIn?.serverId !== serverId) {
            return null;
        }
        const { state } = signIn.view;
        if (runnerStates.has(state)) {
            signIn.view = { ...base(signIn.view), state: 'cancelled' };
        }
        const result: ModelSignInCancelResult =
            signIn.view.state === 'cancelled'
                ? { cancelled: true, signIn: signIn.view }
                : {
                      cancelled: false,
                      reason: signIn.view.state === 'storing' ? 'completing' : 'finished',
                  };
        return { changed: runnerStates.has(state), result };
    }

    end(signInId: string, result: FailedResult) {
        const signIn = this.onRunner(signInId);
        if (!signIn) {
            return null;
        }
        signIn.view =
            result.status === 'cancelled'
                ? { ...base(signIn.view), state: 'cancelled' }
                : { ...base(signIn.view), detail: result.detail, state: 'failed' };
        return signIn.serverId;
    }

    failOnRunner(detail: string) {
        return [...this.pending.keys()].flatMap((signInId) => {
            const serverId = this.end(signInId, { detail, status: 'failed' });
            return serverId ? [{ serverId, signInId }] : [];
        });
    }

    sweep() {
        const now = Date.now();
        const expired: { serverId: string; signInId: string }[] = [];
        for (const [signInId, signIn] of this.pending) {
            if (signIn.view.state === 'storing') {
                continue;
            }
            if (now >= signIn.expiresAt + signInLifetimeMs) {
                this.pending.delete(signInId);
            } else if (now >= signIn.expiresAt && this.onRunner(signInId)) {
                this.end(signInId, { detail: 'The sign-in expired.', status: 'failed' });
                expired.push({ serverId: signIn.serverId, signInId });
            }
        }
        return expired;
    }

    private onRunner(signInId: string) {
        const signIn = this.pending.get(signInId);
        return signIn && runnerStates.has(signIn.view.state) ? signIn : null;
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
