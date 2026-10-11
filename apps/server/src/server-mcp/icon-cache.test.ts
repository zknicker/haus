import { expect, test } from 'bun:test';
import { cacheAnonymousMcpIcons } from './icon-cache.ts';

const input = {
    connectionUrl: 'https://fulfillment.merchbase.co/mcp/printful',
    preferPageIcon: true,
    serverInfoIcons: [],
    timeoutMs: 4000,
};

test('shares concurrent anonymous lookups and retries unavailable art after five minutes', async () => {
    let now = 0;
    let calls = 0;
    const resolveIcon = cacheAnonymousMcpIcons(
        async () => {
            calls += 1;
            return null;
        },
        () => now
    );
    await Promise.all([resolveIcon(input), resolveIcon(input)]);
    expect(calls).toBe(1);
    now = 299_999;
    await resolveIcon(input);
    expect(calls).toBe(1);
    now = 300_000;
    await resolveIcon(input);
    expect(calls).toBe(2);
});

test('authenticated metadata bypasses anonymous branding cache', async () => {
    const advertised = { dark: null, light: 'data:image/png;base64,iVBORw0KGgo=' };
    const resolveIcon = cacheAnonymousMcpIcons(async (request) =>
        request.serverInfoIcons === input.serverInfoIcons ? null : advertised
    );
    expect(await resolveIcon(input)).toBeNull();
    expect(await resolveIcon({ ...input, serverInfoIcons: [{ src: advertised.light }] })).toEqual(
        advertised
    );
    expect(await resolveIcon(input)).toBeNull();
});

test('a rejected lookup can be retried', async () => {
    let calls = 0;
    const resolveIcon = cacheAnonymousMcpIcons(async () => {
        calls += 1;
        if (calls === 1) {
            throw new Error('defect');
        }
        return null;
    });
    await expect(resolveIcon(input)).rejects.toThrow('defect');
    expect(await resolveIcon(input)).toBeNull();
    expect(calls).toBe(2);
});
