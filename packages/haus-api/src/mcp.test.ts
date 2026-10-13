import { describe, expect, test } from 'bun:test';
import { isMcpBearerTokenPreset, mcpPresetAccountCreateSchema, mcpPresetSchema } from './mcp.ts';

const base = { name: 'Account', serverId: 'srv_1' };

describe('preset account auth', () => {
    test('Vercel is no longer an accepted built-in preset', () => {
        expect(mcpPresetSchema.safeParse('vercel').success).toBe(false);
        expect(mcpPresetAccountCreateSchema.safeParse({ ...base, preset: 'vercel' }).success).toBe(
            false
        );
    });

    test('every preset is exactly one auth kind', () => {
        expect(mcpPresetSchema.options.filter(isMcpBearerTokenPreset)).toEqual(['x']);
    });

    test('an OAuth preset cannot carry a token', () => {
        expect(
            mcpPresetAccountCreateSchema.safeParse({ ...base, preset: 'merchbase' }).success
        ).toBe(true);
        expect(
            mcpPresetAccountCreateSchema.safeParse({
                ...base,
                bearerToken: 't',
                preset: 'merchbase',
            }).success
        ).toBe(false);
    });

    test.each([
        'cloudflare',
        'merchbase-atlas',
        'handmade',
        'merchbase-fulfillment',
        'tmterminal',
    ])('%s uses OAuth with a Server-owned endpoint', (preset) => {
        const input = { ...base, preset };
        expect(mcpPresetAccountCreateSchema.safeParse(input).success).toBe(true);
        expect(mcpPresetAccountCreateSchema.safeParse({ ...input, bearerToken: 't' }).success).toBe(
            false
        );
        expect(
            mcpPresetAccountCreateSchema.safeParse({ ...input, url: 'https://other.example/mcp' })
                .success
        ).toBe(false);
    });

    test('CoinGecko connects without accepting credentials or endpoint overrides', () => {
        const input = { ...base, preset: 'coingecko' };
        expect(mcpPresetAccountCreateSchema.safeParse(input).success).toBe(true);
        expect(mcpPresetAccountCreateSchema.safeParse({ ...input, bearerToken: 't' }).success).toBe(
            false
        );
        expect(
            mcpPresetAccountCreateSchema.safeParse({ ...input, url: 'https://other.example/mcp' })
                .success
        ).toBe(false);
    });

    test('a bearer-token preset requires a single header-safe token', () => {
        const parse = (bearerToken?: string) =>
            mcpPresetAccountCreateSchema.safeParse({ ...base, bearerToken, preset: 'x' });

        expect(parse().success).toBe(false);
        expect(parse('   ').success).toBe(false);
        expect(parse('Bearer abc').success).toBe(false);
        expect(parse('abc\r\nX-Injected: 1').success).toBe(false);
        expect(parse('  AAAA%2Bbcd=  ').data).toMatchObject({ bearerToken: 'AAAA%2Bbcd=' });
    });
});
