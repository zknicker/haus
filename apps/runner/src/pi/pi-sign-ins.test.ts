import { afterEach, describe, expect, test } from 'bun:test';
import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from '@earendil-works/pi-ai';
import type { ModelSignInProvider } from '@haus/api';
import { attachRunner, drainCleanups, serverStandIn } from '../runner-test-server.ts';
import { fauxProviderAs } from './pi-faux-run.ts';
import { answerDeviceCode } from './pi-sign-ins.ts';

afterEach(drainCleanups);

const farFuture = 4_102_444_800_000;

function signInAs(
    id: string,
    login: (interaction: ProviderAuthInteraction) => Promise<OAuthCredential>
) {
    const oauth: OAuthAuth = {
        login,
        name: `${id} plan`,
        refresh: () => Promise.reject(new Error('Refresh is not part of sign-in.')),
        toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
    };
    return fauxProviderAs(id, { oauth }, ['faux-1']).provider;
}

function approval() {
    let approve: (credential: OAuthCredential) => void = () => undefined;
    const approved = new Promise<OAuthCredential>((resolve) => {
        approve = resolve;
    });
    return { approve, approved };
}

async function signInRunner(providers: Record<ModelSignInProvider, ReturnType<typeof signInAs>>) {
    const server = serverStandIn();
    await attachRunner(server, { signInProvider: (provider) => providers[provider] });
    await server.frame('runner-inventory');
    return server;
}

describe('device-code sign-in for the App', () => {
    test('two sign-ins run at once: each sends its code, then its credential when approved', async () => {
        const chatgpt = approval();
        const xai = approval();
        const chosen: string[] = [];
        const server = await signInRunner({
            chatgpt: signInAs('openai-codex', async (interaction) => {
                chosen.push(
                    await interaction.prompt({
                        message: 'Select OpenAI Codex login method:',
                        options: [
                            { id: 'browser', label: 'Browser login (default)' },
                            { id: 'device_code', label: 'Device code login (headless)' },
                        ],
                        type: 'select',
                    })
                );
                interaction.notify({
                    type: 'device_code',
                    userCode: 'CHAT-1234',
                    verificationUri: 'https://auth.openai.com/codex/device',
                });
                return await chatgpt.approved;
            }),
            xai: signInAs('xai', (interaction) => {
                interaction.notify({
                    type: 'device_code',
                    userCode: 'GROK-5678',
                    verificationUri: 'https://accounts.x.ai/device?user_code=GROK-5678',
                });
                return xai.approved;
            }),
        });

        server.send({
            provider: 'chatgpt',
            serverId: 'srv_1',
            signInId: 'sgn_1',
            type: 'runner-sign-in-start',
        });
        expect(await server.frame('runner-sign-in-code')).toEqual({
            signInId: 'sgn_1',
            type: 'runner-sign-in-code',
            userCode: 'CHAT-1234',
            verificationUri: 'https://auth.openai.com/codex/device',
        });
        server.send({
            provider: 'xai',
            serverId: 'srv_1',
            signInId: 'sgn_2',
            type: 'runner-sign-in-start',
        });
        expect(await server.frame('runner-sign-in-code')).toMatchObject({
            signInId: 'sgn_2',
            userCode: 'GROK-5678',
        });

        xai.approve({
            access: 'xai-access',
            expires: farFuture,
            refresh: 'xai-refresh',
            type: 'oauth',
        });
        expect(await server.frame('runner-sign-in-finished')).toEqual({
            result: {
                credential: { access: 'xai-access', expires: farFuture, refresh: 'xai-refresh' },
                status: 'connected',
            },
            signInId: 'sgn_2',
            type: 'runner-sign-in-finished',
        });
        chatgpt.approve({
            access: 'chat-access',
            accountId: 'acct_1',
            expires: farFuture,
            refresh: 'chat-refresh',
            type: 'oauth',
        });
        expect(await server.frame('runner-sign-in-finished')).toEqual({
            result: {
                credential: {
                    access: 'chat-access',
                    accountId: 'acct_1',
                    expires: farFuture,
                    refresh: 'chat-refresh',
                },
                status: 'connected',
            },
            signInId: 'sgn_1',
            type: 'runner-sign-in-finished',
        });
        expect(chosen).toEqual(['device_code']);
    });

    test('a cancel ends a waiting sign-in as cancelled, and a provider refusal ends it as failed', async () => {
        const waiting = approval();
        const server = await signInRunner({
            chatgpt: signInAs('openai-codex', (interaction) => {
                interaction.notify({
                    type: 'device_code',
                    userCode: 'CHAT-1234',
                    verificationUri: 'https://auth.openai.com/codex/device',
                });
                return waiting.approved;
            }),
            xai: signInAs('xai', () =>
                Promise.reject(new Error('xAI device authorization was denied'))
            ),
        });

        server.send({
            provider: 'chatgpt',
            serverId: 'srv_1',
            signInId: 'sgn_1',
            type: 'runner-sign-in-start',
        });
        await server.frame('runner-sign-in-code');
        server.send({ signInId: 'sgn_1', type: 'runner-sign-in-cancel' });
        expect(await server.frame('runner-sign-in-finished')).toEqual({
            result: { detail: 'Sign-in cancelled.', status: 'cancelled' },
            signInId: 'sgn_1',
            type: 'runner-sign-in-finished',
        });

        server.send({
            provider: 'xai',
            serverId: 'srv_1',
            signInId: 'sgn_2',
            type: 'runner-sign-in-start',
        });
        expect(await server.frame('runner-sign-in-finished')).toEqual({
            result: { detail: 'xAI device authorization was denied', status: 'failed' },
            signInId: 'sgn_2',
            type: 'runner-sign-in-finished',
        });
    });

    test('the runner answers only the device-code choice and refuses every other prompt', async () => {
        expect(
            await answerDeviceCode({
                message: 'Select OpenAI Codex login method:',
                options: [
                    { id: 'browser', label: 'Browser login (default)' },
                    { id: 'device_code', label: 'Device code login (headless)' },
                ],
                type: 'select',
            })
        ).toBe('device_code');
        await expect(
            answerDeviceCode({ message: 'Paste the code:', type: 'text' })
        ).rejects.toThrow('Haus sign-in has no prompt to answer "Paste the code:".');
    });
});
