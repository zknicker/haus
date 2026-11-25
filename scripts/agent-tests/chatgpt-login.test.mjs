import { describe, expect, test } from 'bun:test';
import { codexCredential } from './chatgpt-login.mjs';

describe('ChatGPT eval login', () => {
    test("a Codex CLI login becomes Pi's credential with the token's expiry and account", () => {
        const access = jwt({
            exp: 1_800_000_000,
            'https://api.openai.com/auth': { chatgpt_account_id: 'acct_1' },
        });
        expect(
            codexCredential({ tokens: { access_token: access, refresh_token: 'rt_1' } })
        ).toEqual({ access, accountId: 'acct_1', expires: 1_800_000_000_000, refresh: 'rt_1' });
    });

    test('a login without a refresh token or account is refused', () => {
        expect(() => codexCredential({ tokens: { access_token: jwt({}) } })).toThrow(
            'holds no ChatGPT sign-in'
        );
        expect(() =>
            codexCredential({ tokens: { access_token: jwt({ exp: 1 }), refresh_token: 'rt_1' } })
        ).toThrow('without an expiry or account');
    });
});

function jwt(claims) {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'none' })}.${part(claims)}.`;
}
