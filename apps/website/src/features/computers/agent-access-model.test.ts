import { expect, test } from 'bun:test';
import {
    agentAccessView,
    captainAccessLabel,
    captainAccessSentence,
    captainChooserChange,
    captainChooserKeys,
    captainScopeRights,
    computerUseSentence,
} from './agent-access-model.ts';

const computerId = 'cmp_devicestudio0000';
const agents = [
    agent('agt_cove', 'Cove', computerId),
    agent('agt_wren', 'Wren', 'cmp_devicemini00000'),
    agent('agt_pike', 'Pike', 'cmp_devicemini00000'),
    agent('agt_ash', 'Ash', 'cmp_devicemini00000'),
    agent('agt_ink', 'Ink', 'cmp_devicemini00000'),
];
const view = agentAccessView({ agents, computerId, grants: [{ agentId: 'agt_wren' }] });

test('the view splits Captains into this Machine, granted, and everyone else by name', () => {
    expect(view.machine.map(({ id }) => id)).toEqual(['agt_cove']);
    expect(view.granted.map(({ id }) => id)).toEqual(['agt_wren']);
    expect(view.others.map(({ id }) => id)).toEqual(['agt_ash', 'agt_ink', 'agt_pike']);
});

test('a grant for a Captain whose Machine is here, or who is gone, is not counted twice', () => {
    const odd = agentAccessView({
        agents,
        computerId,
        grants: [{ agentId: 'agt_cove' }, { agentId: 'agt_retired' }],
    });
    expect(odd.granted).toEqual([]);
    expect(odd.machine.map(({ id }) => id)).toEqual(['agt_cove']);
});

const none = agentAccessView({ agents: [], computerId, grants: [] });
const many = agentAccessView({
    agents,
    computerId,
    grants: ['agt_wren', 'agt_pike', 'agt_ash'].map((agentId) => ({ agentId })),
});

test('the Captains sentence names who can run tools and changes with the value', () => {
    expect(captainAccessSentence('selected', view)).toBe('Cove and Wren can run tools here.');
    expect(captainAccessSentence('all', view)).toBe('Any Captain can run tools here.');
    expect(captainAccessSentence('selected', none)).toBe('No Captains can run tools here.');
    expect(captainAccessSentence('selected', many)).toBe(
        'Cove, Ash, and 2 others can run tools here.'
    );
});

test('the Captains button counts who has access, or says All Captains', () => {
    expect(captainAccessLabel('selected', view)).toBe('2 Captains');
    expect(captainAccessLabel('selected', many)).toBe('4 Captains');
    expect(captainAccessLabel('selected', none)).toBe('No Captains');
    expect(
        captainAccessLabel('selected', agentAccessView({ agents, computerId, grants: [] }))
    ).toBe('1 Captain');
    expect(captainAccessLabel('all', none)).toBe('All Captains');
});

test('only the attacher widens to All Captains; any steward may narrow back', () => {
    const attacher = { canGrant: true, canRevoke: true };
    const steward = { canGrant: false, canRevoke: true };
    const member = { canGrant: false, canRevoke: false };
    expect(captainScopeRights('selected', attacher).canChange).toBe(true);
    expect(captainScopeRights('selected', steward).canChange).toBe(false);
    expect(captainScopeRights('all', steward).canChange).toBe(true);
    expect(captainScopeRights('all', member)).toEqual({ canChange: false, steward: false });
});

test('computer use says what the switch does now', () => {
    expect(computerUseSentence(true)).toBe('Allowed Captains can see and control the screen.');
    expect(computerUseSentence(false)).toBe('Captains can’t see or control the screen.');
});

test('the chooser locks a Machine Captain and only lets each viewer move one way', () => {
    expect(captainChooserKeys(view, { canGrant: true, canRevoke: true })).toEqual({
        disabled: ['agt_cove'],
        selected: ['agt_cove', 'agt_wren'],
    });
    expect(captainChooserKeys(view, { canGrant: false, canRevoke: true }).disabled).toEqual([
        'agt_cove',
        'agt_ash',
        'agt_ink',
        'agt_pike',
    ]);
});

test('a chooser click asks for exactly one grant or one revoke', () => {
    expect(captainChooserChange(view, new Set(['agt_cove', 'agt_wren', 'agt_ink']))).toEqual({
        agentId: 'agt_ink',
        kind: 'grant',
    });
    expect(captainChooserChange(view, new Set(['agt_cove']))).toEqual({
        agentId: 'agt_wren',
        kind: 'revoke',
    });
    expect(captainChooserChange(view, new Set(['agt_cove', 'agt_wren']))).toBeNull();
});

function agent(id: string, displayName: string, machine: string) {
    return { avatarUrl: null, computerId: machine, displayName, id };
}
