import { describe, expect, test } from 'bun:test';
import { isMcpBearerTokenPreset, mcpPresetAccountCreateSchema, mcpPresetSchema } from './mcp.ts';

const base = { name: 'Account', serverId: 'srv_1' };

describe('preset account auth', () => {
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
