import { expect, test } from 'bun:test';
import { invitationLink, serverSearchRoute, usageRoute } from './server-routes.ts';

test('invitation links use the configured browser-reachable Haus App origin', () => {
    expect(invitationLink('secret-token', 'https://app.haus.test')).toBe(
        'https://app.haus.test/invite/secret-token'
    );
});

test('search stays inside the current Server route', () => {
    expect(serverSearchRoute('dev')).toBe('/s/dev/search');
});

test('Agent usage links carry removable Agent, Computer, and runtime filters', () => {
    expect(
        usageRoute('dev', {
            computerId: 'cmp_one',
            runtimeId: 'pi',
        })
    ).toBe('/s/dev/settings/usage?computer=cmp_one&runtime=pi');
    expect(usageRoute('dev', { agentId: 'agt_one' })).toBe('/s/dev/settings/usage?agent=agt_one');
    expect(usageRoute('dev')).toBe('/s/dev/settings/usage');
});
