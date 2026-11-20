import { describe, expect, test } from 'bun:test';
import type { Project } from '@haus/api';
import { TRPCClientError } from '@trpc/client';
import { testChat } from '../features/chats/chat-fixtures.ts';
import { testAgent } from '../features/members/agent-fixtures.ts';
import {
    agentHomeProject,
    matchesProjectSearch,
    projectCaptains,
    projectChoice,
    projectChoices,
    projectRefusalCode,
} from './project-homes.ts';

const project = (chatId: string, name: string, homeAgentIds: string[], isHaus = false) =>
    ({
        archived: false,
        chatId,
        homeAgentIds,
        isHaus,
        key: name.slice(0, 3).toUpperCase(),
        keyEditable: true,
        name,
        serverId: 'srv_1',
        taskKeyId: `key_${chatId}`,
    }) satisfies Project;

const haus = project('cht_haus', 'haus', ['agt_blippy', 'agt_cove'], true);
const ops = project('cht_ops', 'ops', ['agt_tiny', 'agt_nova']);
const empty = project('cht_new', 'new', []);
const projects = [haus, ops, empty];
const blippy = testAgent({ handle: 'blippy', id: 'agt_blippy' });
const cove = testAgent({ handle: 'cove', id: 'agt_cove' });
const tiny = testAgent({ handle: 'tiny', id: 'agt_tiny' });
const nova = testAgent({ handle: 'nova', id: 'agt_nova' });
const retired = testAgent({ handle: 'gone', id: 'agt_gone' });
const agents = [blippy, cove, tiny, nova, retired];

describe('Project homes', () => {
    test('an Agent lives in the Project that lists it', () => {
        expect(agentHomeProject(projects, 'agt_tiny')?.name).toBe('ops');
        expect(agentHomeProject(projects, 'agt_gone')).toBeUndefined();
    });

    test('a picker offers listed Projects with their marks, never an archived one', () => {
        const archived = project('cht_old', 'old', []);
        const chats = new Map(
            [
                testChat({ id: 'cht_haus', name: 'haus' }),
                testChat({ color: 'teal', icon: 'Rocket01Icon', id: 'cht_ops', name: 'ops' }),
                testChat({ id: 'cht_new', name: 'new' }),
                testChat({ archivedAt: '2026-11-01T00:00:00.000Z', id: 'cht_old', name: 'old' }),
            ].map((chat) => [chat.id, chat])
        );
        const unlisted = project('cht_gone', 'gone', []);
        const everything = [...projects, archived, unlisted];

        expect(projectChoices(everything, chats)).toEqual([
            { chatId: 'cht_haus', color: null, icon: null, name: 'haus' },
            { chatId: 'cht_ops', color: 'teal', icon: 'Rocket01Icon', name: 'ops' },
            { chatId: 'cht_new', color: null, icon: null, name: 'new' },
        ]);
        expect(projectChoices(everything, chats, 'cht_ops').map(({ name }) => name)).toEqual([
            'haus',
            'new',
        ]);
        expect(projectChoice(unlisted, undefined)).toBeNull();
    });

    test('Project search matches any part of the name, ignoring case', () => {
        expect(matchesProjectSearch('onboarding-owner', ' OWN')).toBe(true);
        expect(matchesProjectSearch('ops', 'product')).toBe(false);
        expect(matchesProjectSearch('ops', '')).toBe(true);
    });

    test("a Project's Captains keep its order and every other homed Agent can move in", () => {
        const { candidates, captains } = projectCaptains(projects, agents, 'cht_ops');
        expect(captains.map((agent) => agent.handle)).toEqual(['tiny', 'nova']);
        expect(candidates.map(({ agent, home }) => `${agent.handle}@${home.name}`)).toEqual([
            'blippy@haus',
            'cove@haus',
        ]);
    });

    test('a new Project has no Captains and everyone homed is a candidate', () => {
        const { candidates, captains } = projectCaptains(projects, agents, 'cht_new');
        expect(captains).toEqual([]);
        expect(candidates.map(({ agent }) => agent.handle)).toEqual([
            'blippy',
            'cove',
            'tiny',
            'nova',
        ]);
    });

    test('a refusal reads its Project code from the Server error data', () => {
        const refused = TRPCClientError.from({
            error: {
                code: -32_009,
                data: { code: 'CONFLICT', project: { code: 'PROJECT_HAS_AGENTS' } },
                message: 'This Project is home to @tiny. Move them to another Project first.',
            },
        });
        expect(projectRefusalCode(refused)).toBe('PROJECT_HAS_AGENTS');
        expect(projectRefusalCode(new Error('offline'))).toBeNull();
        expect(projectRefusalCode(null)).toBeNull();
    });
});
