import { expect, test } from 'bun:test';
import { Agent, Cursor } from '@cursor/sdk';
import { createCursorSdkTransport } from './sdk-transport.ts';

test('SDK sign-in never opens a browser on the Computer and forwards cancellation', async () => {
    const controller = new AbortController();
    let observedUrl: string | undefined;
    const transport = createCursorSdkTransport(() =>
        Promise.resolve({
            Agent,
            Cursor: {
                ...Cursor,
                auth: {
                    ...Cursor.auth,
                    login: (options) => {
                        expect(options?.openBrowser).toBe(false);
                        expect(options?.signal).toBe(controller.signal);
                        options?.onLoginUrl?.('https://cursor.com/loginDeepControl?uuid=test');
                        return Promise.resolve({
                            apiKey: 'test-key-stays-local',
                            apiKeyExpiresAtMs: Date.now() + 1000,
                        });
                    },
                },
            },
        })
    );
    const result = await transport.login({
        signal: controller.signal,
        onLoginUrl: (url) => {
            observedUrl = url;
        },
    });
    expect(observedUrl).toBe('https://cursor.com/loginDeepControl?uuid=test');
    expect(result.connected).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-key-stays-local');
});
