import {
    type AuthEvent,
    type AuthPrompt,
    InMemoryCredentialStore,
    type Provider,
} from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import {
    type ModelSignInProvider,
    modelOAuthCredentialSchema,
    type RunnerSignInCancelFrame,
    type RunnerSignInFinishedFrame,
    type RunnerSignInStartFrame,
    runnerSignInCodeFrameSchema,
} from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import { noAmbientAuth, piProviderFor } from './pi-models.ts';

const detailMax = 500;

export type SignIns = ReturnType<typeof createSignIns>;

export function createSignIns(input: {
    link: RunnerLink;
    provider?: (provider: ModelSignInProvider) => Provider;
}) {
    const providerFor = input.provider ?? piProviderFor;
    const running = new Map<string, AbortController>();

    const signIn = async (frame: RunnerSignInStartFrame, signal: AbortSignal) => {
        const provider = providerFor(frame.provider);
        const models = createModels({
            authContext: noAmbientAuth,
            credentials: new InMemoryCredentialStore(),
        });
        models.setProvider(provider);
        const credential = await models.login(provider.id, 'oauth', {
            notify: (event) => notify(frame.signInId, event),
            prompt: answerDeviceCode,
            signal,
        });
        if (credential.type !== 'oauth') {
            throw new Error(`${provider.name} returned an API key instead of a sign-in.`);
        }
        const { type: _type, ...tokens } = credential;
        return modelOAuthCredentialSchema.parse(tokens);
    };

    const notify = (signInId: string, event: AuthEvent) => {
        if (event.type !== 'device_code') {
            return;
        }
        const code = runnerSignInCodeFrameSchema.safeParse({
            signInId,
            type: 'runner-sign-in-code',
            userCode: event.userCode,
            verificationUri: event.verificationUri,
        });
        if (!code.success) {
            throw new Error('The provider sent a sign-in code Haus cannot show.');
        }
        input.link.send(code.data);
    };

    const finish = (signInId: string, result: RunnerSignInFinishedFrame['result']) => {
        input.link.send({ result, signInId, type: 'runner-sign-in-finished' });
    };

    return {
        cancel(frame: RunnerSignInCancelFrame) {
            running.get(frame.signInId)?.abort();
        },
        start(frame: RunnerSignInStartFrame) {
            if (running.has(frame.signInId)) {
                return;
            }
            const controller = new AbortController();
            running.set(frame.signInId, controller);
            signIn(frame, controller.signal)
                .then(
                    (credential) => finish(frame.signInId, { credential, status: 'connected' }),
                    (error: unknown) =>
                        finish(
                            frame.signInId,
                            controller.signal.aborted
                                ? { detail: 'Sign-in cancelled.', status: 'cancelled' }
                                : { detail: failureDetail(error), status: 'failed' }
                        )
                )
                .then(() => running.delete(frame.signInId));
        },
    };
}

export function answerDeviceCode(prompt: AuthPrompt) {
    if (prompt.type === 'select' && prompt.options.some((option) => option.id === deviceCode)) {
        return Promise.resolve(deviceCode);
    }
    return Promise.reject(new Error(`Haus sign-in has no prompt to answer "${prompt.message}".`));
}

function failureDetail(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    return text.trim().slice(0, detailMax).trim() || 'Sign-in failed.';
}

const deviceCode = 'device_code';
