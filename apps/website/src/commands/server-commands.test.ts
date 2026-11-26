import { describe, expect, test } from 'bun:test';
import type { Agent, Chat } from '@haus/api';
import { buildCommandGroups, getCurrentChatId } from './server-commands.ts';

const agent = {
    displayName: 'Cove',
    handle: 'cove',
    id: 'agt_cove',
} as Agent;
const chats = [
    {
        color: 'violet',
        icon: 'RocketIcon',
        id: 'cht_all',
        isAll: true,
        kind: 'channel',
        name: 'all',
        peerAgentId: null,
    },
    {
        color: null,
        icon: null,
        id: 'cht_cove',
        isAll: false,
        kind: 'captain',
        name: null,
        peerAgentId: agent.id,
        peerUserId: null,
    },
    {
        color: null,
        icon: null,
        id: 'cht_bo',
        isAll: false,
        kind: 'dm',
        name: null,
        peerAgentId: null,
        peerUserId: 'usr_bo',
    },
] as Chat[];

describe('Server command groups', () => {
    test('preserves Server navigation, Chats, current-Chat actions, settings, and developer groups', () => {
        const navigated: string[] = [];
        const groups = buildCommandGroups({
            agents: [agent],
            chats,
            devMode: false,
            navigate: (path) => navigated.push(path),
            openAgentProfile: () => undefined,
            pathname: '/s/dev/chats/cht_cove',
            role: 'owner',
            serverSlug: 'dev',
            setDevMode: () => undefined,
        });

        expect(groups.map((group) => group.title)).toEqual([
            'Navigation',
            'Projects',
            'Captains',
            'DMs',
            'Current Chat',
            'Settings',
            'Developer',
        ]);
        const titles = groups.flatMap((group) => group.commands.map((command) => command.title));
        expect(titles).toContain('Focus Composer');
        expect(titles).toContain('Captain Profile');
        expect(titles).not.toContain('Reminders');
        expect(groups.find((group) => group.id === 'developer')?.commands).toHaveLength(2);

        const captainChat = groups.find((group) => group.id === 'captain-chats')?.commands[0];
        expect(captainChat?.title).toBe('Cove');
        expect(captainChat?.keywords).toContain('cove');
        captainChat?.run();
        groups.find((group) => group.id === 'direct-messages')?.commands[0]?.run();
        expect(navigated).toEqual(['/s/dev/chats/cht_cove', '/s/dev/chats/cht_bo']);
    });

    test("carries a channel's chosen icon and color into its command", () => {
        const groups = buildCommandGroups({
            agents: [agent],
            chats,
            devMode: false,
            navigate: () => undefined,
            openAgentProfile: () => undefined,
            pathname: '/s/dev',
            role: 'owner',
            serverSlug: 'dev',
            setDevMode: () => undefined,
        });

        expect(groups.find((group) => group.id === 'channels')?.commands[0]?.icon).toEqual({
            color: 'violet',
            icon: 'RocketIcon',
            kind: 'channel',
        });
    });

    test('recognizes Server Chat routes and omits operator commands for members', () => {
        expect(getCurrentChatId('/s/dev/chats/cht_cove', 'dev')).toBe('cht_cove');
        expect(getCurrentChatId('/s/dev/tasks', 'dev')).toBeNull();

        const navigated: string[] = [];
        const groups = buildCommandGroups({
            agents: [agent],
            chats,
            devMode: false,
            navigate: (path) => navigated.push(path),
            openAgentProfile: () => undefined,
            pathname: '/s/dev/tasks',
            role: 'member',
            serverSlug: 'dev',
            setDevMode: () => undefined,
        });
        const titles = groups.flatMap((group) => group.commands.map((command) => command.title));

        // The Server Activity page is member-readable (agent.serverTurns is a member procedure).
        expect(titles).toContain('Activity');
        expect(titles).not.toContain('Computers');
        expect(titles).not.toContain('Reminders');

        groups
            .find((group) => group.id === 'navigation')
            ?.commands.find((command) => command.title === 'Home')
            ?.run();
        expect(navigated).toEqual(['/s/dev']);
    });

    test('offers archived Chats, which no longer have a sidebar row', () => {
        const navigated: string[] = [];
        const groups = buildCommandGroups({
            agents: [agent],
            chats,
            devMode: false,
            navigate: (path) => navigated.push(path),
            openAgentProfile: () => undefined,
            pathname: '/s/dev/tasks',
            role: 'member',
            serverSlug: 'dev',
            setDevMode: () => undefined,
        });

        groups
            .find((group) => group.id === 'navigation')
            ?.commands.find((command) => command.title === 'Archived chats')
            ?.run();
        expect(navigated).toEqual(['/s/dev/settings/archived']);
    });

    test('omits a retired Captain from chat commands', () => {
        const retiredChats = chats.map((chat) =>
            chat.id === 'cht_cove'
                ? {
                      ...chat,
                      peerAgentDisplayName: 'Cove',
                      peerAgentRetired: true,
                  }
                : chat
        );
        const groups = buildCommandGroups({
            agents: [],
            chats: retiredChats,
            devMode: false,
            navigate: () => undefined,
            openAgentProfile: () => undefined,
            pathname: '/s/dev/chats/cht_cove',
            role: 'owner',
            serverSlug: 'dev',
            setDevMode: () => undefined,
        });
        const titles = groups.flatMap((group) => group.commands.map((command) => command.title));

        expect(titles).not.toContain('Cove');
        expect(titles).not.toContain('Focus Composer');
    });
    test('with the Capy shell on, Navigation offers Home in place of Chat and Inbox', () => {
        const navigated: string[] = [];
        const context = {
            agents: [agent],
            chats,
            devMode: false,
            navigate: (path: string) => navigated.push(path),
            openAgentProfile: () => undefined,
            pathname: '/s/dev/chats/cht_cove',
            role: 'owner' as const,
            serverSlug: 'dev',
            setDevMode: () => undefined,
        };
        const navigation = () =>
            buildCommandGroups(context)
                .find((group) => group.id === 'navigation')
                ?.commands.map((command) => command.title);

        expect(navigation()).toEqual([
            'Search',
            'Home',
            'Issues',
            'Tasks',
            'Activity',
            'Members',
            'Archived chats',
        ]);
        buildCommandGroups(context)
            .find((group) => group.id === 'navigation')
            ?.commands.find((command) => command.title === 'Home')
            ?.run();
        expect(navigated).toEqual(['/s/dev']);
    });
});
