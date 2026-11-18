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

test('an expired entry answers at once while one background lookup replaces it', async () => {
    const first = { dark: null, light: 'data:image/png;base64,Zmlyc3Q=' };
    const second = { dark: null, light: 'data:image/png;base64,c2Vjb25k' };
    let now = 0;
    let calls = 0;
    let finishRefresh: (icon: typeof second) => void = () => undefined;
    const resolveIcon = cacheAnonymousMcpIcons(
        () => {
            calls += 1;
            if (calls === 1) {
                return Promise.resolve(first);
            }
            return new Promise((resolve) => {
                finishRefresh = resolve;
            });
        },
        () => now
    );
    expect(await resolveIcon(input)).toEqual(first);
    now = 300_000;
    expect(await resolveIcon(input)).toEqual(first);
    expect(await resolveIcon(input)).toEqual(first);
    expect(calls).toBe(2);
    finishRefresh(second);
    await Promise.resolve();
    expect(await resolveIcon(input)).toEqual(second);
    expect(calls).toBe(2);
});

test('a failed refresh keeps the last answer and retries on a later read', async () => {
    const icon = { dark: null, light: 'data:image/png;base64,aWNvbg==' };
    let now = 0;
    let calls = 0;
    const resolveIcon = cacheAnonymousMcpIcons(
        async () => {
            calls += 1;
            if (calls === 2) {
                throw new Error('offline');
            }
            return icon;
        },
        () => now
    );
    await resolveIcon(input);
    now = 300_000;
    expect(await resolveIcon(input)).toEqual(icon);
    await Promise.resolve();
    expect(await resolveIcon(input)).toEqual(icon);
    expect(calls).toBe(3);
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
