import { expect, test } from 'bun:test';
import { firstRunCopy, homeState } from './home-state.ts';

const captain = { displayName: 'Forge', id: 'forge' };
const project = (id: string) => ({ id, name: id });

test('Home renders nothing until both lists have loaded', () => {
    expect(homeState({ captains: undefined, lastChatId: null, projects: [] })).toEqual({
        kind: 'loading',
    });
    expect(homeState({ captains: [], lastChatId: null, projects: undefined })).toEqual({
        kind: 'loading',
    });
});

test('a new Haus with no Projects and no Captains is a first run needing both', () => {
    expect(homeState({ captains: [], lastChatId: null, projects: [] })).toEqual({
        kind: 'first-run',
        needsCaptain: true,
        needsProject: true,
    });
});

test('one Project and no Captain needs a Captain; one Captain and no Project needs a Project', () => {
    expect(homeState({ captains: [], lastChatId: null, projects: [project('eng')] })).toEqual({
        kind: 'first-run',
        needsCaptain: true,
        needsProject: false,
    });
    expect(homeState({ captains: [captain], lastChatId: null, projects: [] })).toEqual({
        kind: 'first-run',
        needsCaptain: false,
        needsProject: true,
    });
});

test('with both, the composer opens on the last Project, else the first', () => {
    const projects = [project('eng'), project('sec')];
    expect(homeState({ captains: [captain], lastChatId: 'sec', projects })).toEqual({
        captains: [captain],
        initialProjectId: 'sec',
        kind: 'ready',
        projects,
    });
    expect(homeState({ captains: [captain], lastChatId: 'gone', projects })).toMatchObject({
        initialProjectId: 'eng',
    });
});

test('first-run copy names what is missing and offers what the viewer can do', () => {
    expect(firstRunCopy({ canManage: true, needsCaptain: true, needsProject: true })).toEqual({
        actions: ['project', 'captain'],
        description: 'Create a project for the work, then add a Captain to do it.',
        title: 'Set up your Haus',
    });
    expect(firstRunCopy({ canManage: false, needsCaptain: true, needsProject: true })).toEqual({
        actions: ['project'],
        description: 'Create a project for the work. An Owner or Admin adds Captains.',
        title: 'Set up your Haus',
    });
    expect(firstRunCopy({ canManage: true, needsCaptain: false, needsProject: true })).toEqual({
        actions: ['project'],
        description: 'Projects hold the work your Captains take on.',
        title: 'Create your first project',
    });
    expect(firstRunCopy({ canManage: true, needsCaptain: true, needsProject: false })).toEqual({
        actions: ['captain'],
        description: 'Captains take on the work you ask for here.',
        title: 'Add your first Captain',
    });
    expect(firstRunCopy({ canManage: false, needsCaptain: true, needsProject: false })).toEqual({
        actions: [],
        description: 'An Owner or Admin adds Captains.',
        title: 'No Captains yet',
    });
});
