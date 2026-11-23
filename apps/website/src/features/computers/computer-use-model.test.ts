import { expect, test } from 'bun:test';
import {
    computerUseAgentsSummary,
    computerUseCaptains,
    computerUseNeedsGrant,
    computerUsePermissions,
    nextComputerUseAgents,
    supportsComputerUse,
} from './computer-use-model.ts';

const ready = {
    accessibility: 'granted',
    installed: true,
    macosVersion: '27.3',
    screenRecording: 'granted',
    version: '1.3.1',
} as const;

const captains = [
    { displayName: 'Cove', home: true, id: 'agt_cove' },
    { displayName: 'Forge', home: true, id: 'agt_forge' },
    { displayName: 'Wren', home: false, id: 'agt_wren' },
];

test('a ready Device needs nothing, and an older Computer that reports no readiness has no rows', () => {
    expect(computerUseNeedsGrant(ready)).toBe(false);
    expect(computerUsePermissions(undefined)).toEqual([]);
    expect(computerUsePermissions({ ...ready, installed: false })).toEqual([]);
});

test('macOS 27.3 names System & App Protection Override and its Override System Protections steps', () => {
    const [accessibility, screen] = computerUsePermissions({ ...ready, accessibility: 'denied' });
    expect(accessibility).toMatchObject({
        pane: 'System & App Protection Override',
        settingsUrl:
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        state: 'denied',
        steps: 'Click +, choose Override System Protections, then Choose Apps. Pick Haus Computer and choose Control Your Entire Mac and All Apps.',
    });
    expect(screen).toMatchObject({
        pane: 'Screen & System Audio Recording',
        settingsUrl:
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
        state: 'granted',
    });
    expect(computerUseNeedsGrant({ ...ready, accessibility: 'denied' })).toBe(true);
});

test('pane names follow the macOS version', () => {
    const panes = (macosVersion: string | undefined) =>
        computerUsePermissions({ ...ready, macosVersion }).map((permission) => permission.pane);
    expect(panes('27.1')).toEqual([
        'Device Control and Data Access',
        'Screen & System Audio Recording',
    ]);
    expect(panes('26.4')).toEqual(['Accessibility', 'Screen & System Audio Recording']);
    expect(panes('14.6')).toEqual(['Accessibility', 'Screen Recording']);
    expect(panes(undefined)).toEqual(['Accessibility', 'Screen Recording']);
});

test('the Captains picker moves between all and a named list, and never saves an empty one', () => {
    expect(nextComputerUseAgents({ kind: 'all' }, ['all', 'agt_cove'])).toEqual({
        agentIds: ['agt_cove'],
        kind: 'named',
    });
    expect(
        nextComputerUseAgents({ agentIds: ['agt_cove'], kind: 'named' }, ['agt_cove', 'all'])
    ).toEqual({ kind: 'all' });
    expect(nextComputerUseAgents({ agentIds: ['agt_cove'], kind: 'named' }, [])).toBeNull();
});

test('the Captains summary says all includes later Captains, and names a named list', () => {
    expect(computerUseAgentsSummary({ kind: 'all' }, captains)).toBe(
        'All Captains on this Device, including ones added later (now Cove and Forge).'
    );
    expect(computerUseAgentsSummary({ agentIds: ['agt_forge'], kind: 'named' }, captains)).toBe(
        'Only Forge.'
    );
    expect(computerUseAgentsSummary({ agentIds: [], kind: 'named' }, captains)).toBe(
        'No Captains. Pick at least one.'
    );
});

test('all covers only home Captains, and a named list can name a Captain Agent access allows', () => {
    expect(
        computerUseAgentsSummary({ agentIds: ['agt_cove', 'agt_wren'], kind: 'named' }, captains)
    ).toBe('Only Cove and Wren.');
    expect(
        computerUseCaptains(
            [
                { computerId: 'cmp_other', displayName: 'Wren', id: 'agt_wren' },
                { computerId: 'cmp_other', displayName: 'Pike', id: 'agt_pike' },
                { computerId: 'cmp_studio', displayName: 'Cove', id: 'agt_cove' },
            ],
            'cmp_studio',
            ['agt_wren']
        )
    ).toEqual([
        { displayName: 'Cove', home: true, id: 'agt_cove' },
        { displayName: 'Wren', home: false, id: 'agt_wren' },
    ]);
});

test('computer use is offered only on macOS', () => {
    expect(supportsComputerUse({ operatingSystem: 'darwin' })).toBe(true);
    expect(supportsComputerUse({ operatingSystem: 'linux' })).toBe(false);
});
