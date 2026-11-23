import { expect, test } from 'bun:test';
import {
    agentAccessView,
    captainAccessSentence,
    captainChooserChange,
    captainChooserKeys,
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

test('the Captain access sentence names who can run tools and changes with the value', () => {
    expect(captainAccessSentence('selected', view)).toBe('Only Cove and Wren can run tools here.');
    expect(captainAccessSentence('all', view)).toBe(
        'Any Captain on this Server can run tools here.'
    );
    expect(
        captainAccessSentence('selected', agentAccessView({ agents: [], computerId, grants: [] }))
    ).toBe('No Captains can run tools here yet.');
    const many = agentAccessView({
        agents,
        computerId,
        grants: ['agt_wren', 'agt_pike', 'agt_ash'].map((agentId) => ({ agentId })),
    });
    expect(captainAccessSentence('selected', many)).toBe(
        'Only Cove, Ash, and 2 others can run tools here.'
    );
});

test('computer use says what the switch does now', () => {
    expect(computerUseSentence(true)).toBe(
        'Those Captains can see the screen and click and type in apps.'
    );
    expect(computerUseSentence(false)).toBe('Captains can’t see or control this Mac’s screen.');
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
