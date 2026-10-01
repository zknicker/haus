import { expect, test } from 'bun:test';
import {
    agentSkillNames,
    countAgentAutomations,
    formatAutomationsFact,
    formatNameList,
    grantedAgentConnections,
} from './agent-hub-model.ts';

test('the Automations count is what is still standing, not what has run', () => {
    const counts = countAgentAutomations(
        [{ status: 'scheduled' }, { status: 'fired' }, { status: 'scheduled' }],
        [{ status: 'armed' }, { status: 'disabled' }]
    );
    expect(counts).toEqual({ armedTriggers: 1, scheduledReminders: 2, total: 3 });
    expect(formatAutomationsFact(counts)).toBe('2 reminders · 1 trigger');
});

test('an Agent with no standing automations counts zero', () => {
    expect(countAgentAutomations([], [])).toEqual({
        armedTriggers: 0,
        scheduledReminders: 0,
        total: 0,
    });
    expect(formatAutomationsFact(countAgentAutomations([], []))).toBe('Nothing scheduled');
    expect(formatAutomationsFact({ armedTriggers: 0, scheduledReminders: 1, total: 1 })).toBe(
        '1 reminder'
    );
});

test('Connections is only what this Agent can use right now', () => {
    const grants = [{ agentId: 'agt_1' }];
    const usable = { connected: true, grants, name: 'search', tools: [{ name: 'search' }] };
    const granted = grantedAgentConnections(
        [
            usable,
            // Granted but offline, so the Agent cannot call it.
            { connected: false, grants, name: 'offline', tools: [{ name: 'search' }] },
            // Connected but toolless, so there is nothing to call.
            { connected: true, grants, name: 'toolless', tools: [] },
            // Connected and useful, but granted to somebody else.
            {
                connected: true,
                grants: [{ agentId: 'agt_2' }],
                name: 'theirs',
                tools: [{ name: 'search' }],
            },
        ],
        'agt_1'
    );
    // One selector, so the hub card and anything else naming this set agree.
    expect(granted).toEqual([usable]);
});

test('Skills are named from the reporting Agent library, and empty without a report', () => {
    const agentSkills = [
        { agentId: 'agt_1', skills: [{ name: 'research' }, { name: 'writing' }] },
        { agentId: 'agt_2', skills: [{ name: 'research' }] },
    ];
    expect(agentSkillNames(agentSkills, 'agt_1')).toEqual(['research', 'writing']);
    expect(agentSkillNames(agentSkills, 'agt_missing')).toEqual([]);
    expect(agentSkillNames(undefined, 'agt_1')).toEqual([]);
});

test('a card names two members and counts the rest', () => {
    expect(formatNameList([])).toBe('None');
    expect(formatNameList(['Visuals'])).toBe('Visuals');
    expect(formatNameList(['Atlas', 'BidBeacon'])).toBe('Atlas, BidBeacon');
    expect(formatNameList(['Atlas', 'BidBeacon', 'Cove', 'Drift'])).toBe('Atlas, BidBeacon +2');
});
