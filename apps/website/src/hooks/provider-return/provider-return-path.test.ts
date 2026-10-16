import { describe, expect, test } from 'bun:test';
import { providerReturnPath } from './provider-return-path.ts';

const scope = { origins: ['https://haus.chat'], serverPath: '/s/acme' };

describe('provider return path', () => {
    test("Linear's callback landing on this Server's Settings is a return, query kept", () => {
        expect(
            providerReturnPath(
                'https://haus.chat/s/acme/settings/connections/mcp_1?linear_setup=workspace_reconnected',
                scope
            )
        ).toBe('/s/acme/settings/connections/mcp_1?linear_setup=workspace_reconnected');
    });

    test('a provider page, another origin, or another Server is not a return', () => {
        expect(providerReturnPath('https://linear.app/oauth/authorize?x=1', scope)).toBeNull();
        expect(
            providerReturnPath('https://evil.example/s/acme/settings?linear_setup=x', scope)
        ).toBeNull();
        expect(providerReturnPath('https://haus.chat/s/acme-two/settings', scope)).toBeNull();
        expect(providerReturnPath('https://haus.chat/invite/abc', scope)).toBeNull();
        expect(providerReturnPath('not a url', scope)).toBeNull();
    });
});
