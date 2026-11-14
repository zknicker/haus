import { expect, test } from 'bun:test';
import {
    resolveAgentSectionParam,
    resolveAgentSectionParamForRole,
} from './agent-section-route.ts';

test('current sections render in place', () => {
    for (const section of [
        'home',
        'runtime',
        'automations',
        'connections',
        'permissions',
        'activity',
        'workspace',
    ] as const) {
        expect(resolveAgentSectionParam(section)).toEqual({ kind: 'section', section });
    }
});

test('Permissions opens for an Owner or Admin and sends a Member to the hub', () => {
    for (const role of ['owner', 'admin'] as const) {
        expect(resolveAgentSectionParamForRole('permissions', role)).toEqual({
            kind: 'section',
            section: 'permissions',
        });
    }
    // The same fallback an unknown segment gets, not a gate.
    expect(resolveAgentSectionParamForRole('permissions', 'member')).toEqual(
        resolveAgentSectionParam('tools')
    );
    expect(resolveAgentSectionParamForRole('connections', 'member')).toEqual({
        kind: 'section',
        section: 'connections',
    });
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
