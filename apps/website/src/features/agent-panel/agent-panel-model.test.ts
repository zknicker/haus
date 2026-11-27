import { expect, test } from 'bun:test';
import { isAgentPanelKey } from './agent-panel-key.ts';
import {
    agentPanelKey,
    agentPanelStateSchema,
    agentPanelSubject,
    captainSectionForDrill,
    captainViewForSection,
    defaultAgentPanelState,
    drillParent,
} from './agent-panel-model.ts';

test('only a DM with a Captain has a panel, keyed off its Captain', () => {
    const captain = agentPanelSubject({ kind: 'captain', peerAgentId: 'agt_juniper' });
    expect(captain).toEqual({ agentId: 'agt_juniper', kind: 'captain' });
    expect(captain ? agentPanelKey(captain) : null).toBe('captain:agt_juniper');
    expect(agentPanelSubject({ kind: 'captain', peerAgentId: null })).toBeNull();
    expect(agentPanelSubject({ kind: 'channel', peerAgentId: null })).toBeNull();
});

test('a Captain chat opens with the panel open on Overview the first time', () => {
    expect(defaultAgentPanelState).toEqual({
        open: true,
        view: { drill: null, tab: 'overview' },
    });
    expect(
        agentPanelStateSchema.safeParse({ open: true, view: { drill: 'x', tab: 'overview' } })
            .success
    ).toBe(false);
});

test('the old profile sections land on their drill-in, and anything else on Overview', () => {
    const drillOf = (section: string | undefined, role: 'admin' | 'member' | 'owner' = 'owner') =>
        captainViewForSection(section, role).drill;
    expect(drillOf('home')).toBeNull();
    expect(drillOf(undefined)).toBeNull();
    expect(drillOf('tools')).toBeNull();
    expect(drillOf('constructor')).toBeNull();
    expect(drillOf('runtime')).toBe('runs-on');
    expect(drillOf('setup')).toBe('runs-on');
    expect(drillOf('instructions')).toBe('profile');
    for (const drill of ['runs-on', 'model', 'settings', 'skills'] as const) {
        expect(drillOf(captainSectionForDrill(drill))).toBe(drill);
    }
    for (const section of [
        'automations',
        'skills',
        'connections',
        'workspace',
        'activity',
    ] as const) {
        expect(drillOf(section, 'member')).toBe(section);
    }
    expect(drillOf('permissions', 'admin')).toBe('permissions');
    expect(drillOf('permissions', 'member')).toBeNull();
    expect(captainViewForSection('skills', 'owner').tab).toBe('overview');
});

test('the back arrow returns an All settings editor to All settings, and the rest to Overview', () => {
    expect(drillParent('skills')).toBe('settings');
    expect(drillParent('permissions')).toBe('settings');
    expect(drillParent('runs-on')).toBeNull();
    expect(drillParent('model')).toBeNull();
    expect(drillParent('settings')).toBeNull();
    expect(drillParent('activity')).toBeNull();
});

test('⌘. and Ctrl+. toggle the panel; other chords do not', () => {
    const press = (
        key: string,
        modifiers: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>>
    ) =>
        isAgentPanelKey({
            altKey: modifiers.alt ?? false,
            ctrlKey: modifiers.ctrl ?? false,
            key,
            metaKey: modifiers.meta ?? false,
            shiftKey: modifiers.shift ?? false,
        });
    expect(press('.', { meta: true })).toBe(true);
    expect(press('.', { ctrl: true })).toBe(true);
    expect(press('.', {})).toBe(false);
    expect(press('.', { meta: true, shift: true })).toBe(false);
    expect(press(',', { meta: true })).toBe(false);
});
