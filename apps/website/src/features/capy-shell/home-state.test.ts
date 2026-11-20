import { expect, test } from 'bun:test';
import { firstRunCopy, homeState } from './home-state.ts';

const captain = { displayName: 'Forge', id: 'forge' };
const project = (id: string) => ({ id, name: id });

test('Home renders nothing until Captains, Projects and Devices have loaded', () => {
    expect(
        homeState({ captains: undefined, deviceCount: 0, lastChatId: null, projects: [] })
    ).toEqual({ kind: 'loading' });
    expect(
        homeState({ captains: [], deviceCount: 0, lastChatId: null, projects: undefined })
    ).toEqual({ kind: 'loading' });
    expect(
        homeState({ captains: [], deviceCount: undefined, lastChatId: null, projects: [] })
    ).toEqual({ kind: 'loading' });
});

test('a new Haus with nothing needs a device, a Project and a Captain', () => {
    expect(homeState({ captains: [], deviceCount: 0, lastChatId: null, projects: [] })).toEqual({
        kind: 'first-run',
        needsCaptain: true,
        needsDevice: true,
        needsProject: true,
    });
});

test('one Project and no Captain, or one Captain and no Project, is still a first run', () => {
    expect(
        homeState({ captains: [], deviceCount: 1, lastChatId: null, projects: [project('eng')] })
    ).toEqual({ kind: 'first-run', needsCaptain: true, needsDevice: false, needsProject: false });
    expect(
        homeState({ captains: [captain], deviceCount: 0, lastChatId: null, projects: [] })
    ).toEqual({ kind: 'first-run', needsCaptain: false, needsDevice: false, needsProject: true });
});

test('with both, the composer opens on the last Project, else the first', () => {
    const projects = [project('eng'), project('sec')];
    expect(homeState({ captains: [captain], deviceCount: 1, lastChatId: 'sec', projects })).toEqual(
        { captains: [captain], initialProjectId: 'sec', kind: 'ready', projects }
    );
    expect(
        homeState({ captains: [captain], deviceCount: 1, lastChatId: 'gone', projects })
    ).toMatchObject({ initialProjectId: 'eng' });
});

test('0 Captains and 0 Devices leads an Owner with Add a device and holds back New Captain', () => {
    expect(
        firstRunCopy({ canManage: true, needsCaptain: true, needsDevice: true, needsProject: true })
    ).toEqual({
        actions: ['device', 'project'],
        description:
            'Create a project for the work. A Captain needs a device first, so connect one before adding a Captain.',
        title: 'Set up your Haus',
    });
    expect(
        firstRunCopy({
            canManage: true,
            needsCaptain: true,
            needsDevice: true,
            needsProject: false,
        })
    ).toEqual({
        actions: ['device'],
        description: 'A Captain needs a device first, so connect one before adding a Captain.',
        title: 'Connect a device',
    });
});

test('0 Captains and 0 Devices tells a Member an Owner or Admin connects a device', () => {
    expect(
        firstRunCopy({
            canManage: false,
            needsCaptain: true,
            needsDevice: true,
            needsProject: true,
        })
    ).toEqual({
        actions: ['project'],
        description:
            'Create a project for the work. An Owner or Admin connects a device and adds Captains.',
        title: 'Set up your Haus',
    });
    expect(
        firstRunCopy({
            canManage: false,
            needsCaptain: true,
            needsDevice: true,
            needsProject: false,
        })
    ).toEqual({
        actions: [],
        description: 'An Owner or Admin connects a device and adds Captains.',
        title: 'No Captains yet',
    });
});

test('0 Captains with a device offers New Captain to an Owner and says who adds them to a Member', () => {
    expect(
        firstRunCopy({
            canManage: true,
            needsCaptain: true,
            needsDevice: false,
            needsProject: false,
        })
    ).toEqual({
        actions: ['captain'],
        description: 'Add a Captain to take on the work you ask for here.',
        title: 'Add your first Captain',
    });
    expect(
        firstRunCopy({
            canManage: false,
            needsCaptain: true,
            needsDevice: false,
            needsProject: false,
        })
    ).toEqual({
        actions: [],
        description: 'An Owner or Admin adds Captains.',
        title: 'No Captains yet',
    });
});

test('Projects alone missing offers Create a project to everyone', () => {
    expect(
        firstRunCopy({
            canManage: false,
            needsCaptain: false,
            needsDevice: false,
            needsProject: true,
        })
    ).toEqual({
        actions: ['project'],
        description: 'Create a project for the work.',
        title: 'Create your first project',
    });
});

test('a Member, who cannot list devices, still gets Home and the first run', () => {
    expect(homeState({ captains: [], deviceCount: null, lastChatId: null, projects: [] })).toEqual({
        kind: 'first-run',
        needsCaptain: true,
        needsDevice: true,
        needsProject: true,
    });
    expect(
        homeState({
            captains: [captain],
            deviceCount: null,
            lastChatId: null,
            projects: [project('eng')],
        }).kind
    ).toBe('ready');
});
