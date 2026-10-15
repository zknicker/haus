import { expect, test } from 'bun:test';
import { linearChipToken } from './issue-chip-tokens.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';
import type { LinearTokenRefresher } from './token-refresh.ts';

// Chips and thumbnails read through the refresh owner: sign-in required reads
// as unavailable, and any other failure surfaces.

function refresher(connectionToken: (connectionId: string) => Promise<string>) {
    return { connectionToken } as unknown as LinearTokenRefresher;
}

test('a refreshed connection token is the chip token', async () => {
    const token = linearChipToken(refresher((id) => Promise.resolve(`token-${id}`)));
    expect(await token('mcp_1')).toBe('token-mcp_1');
});

test('no Haus app or a workspace needing sign-in reads as no token', async () => {
    expect(await linearChipToken(null)('mcp_1')).toBeNull();
    const signIn = refresher(() => Promise.reject(new LinearSignInRequiredError()));
    expect(await linearChipToken(signIn)('mcp_1')).toBeNull();
});

test('any other failure surfaces', async () => {
    const down = refresher(() => Promise.reject(new Error('Linear answered 503')));
    await expect(linearChipToken(down)('mcp_1')).rejects.toThrow('Linear answered 503');
});
