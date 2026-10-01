import { expect, test } from 'bun:test';
import { resolveAgentSectionParam } from './agent-section-route.ts';

test('current sections render in place', () => {
    for (const section of ['home', 'runtime', 'automations', 'activity', 'workspace'] as const) {
        expect(resolveAgentSectionParam(section)).toEqual({ kind: 'section', section });
    }
});

test('retired tabs redirect to the section that holds them now', () => {
    expect(resolveAgentSectionParam('overview')).toEqual({ kind: 'redirect', section: 'home' });
    expect(resolveAgentSectionParam('setup')).toEqual({ kind: 'redirect', section: 'runtime' });
    expect(resolveAgentSectionParam('instructions')).toEqual({
        kind: 'redirect',
        section: 'profile',
    });
});

test('unknown or missing segments fall back to the hub', () => {
    expect(resolveAgentSectionParam('tools')).toEqual({ kind: 'redirect', section: 'home' });
    expect(resolveAgentSectionParam('constructor')).toEqual({ kind: 'redirect', section: 'home' });
    expect(resolveAgentSectionParam(undefined)).toEqual({ kind: 'redirect', section: 'home' });
});
