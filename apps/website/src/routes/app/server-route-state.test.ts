import { describe, expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import {
    resolveActiveSection,
    resolveAgentProfileTarget,
    resolveChatSectionRoute,
    resolveSelectedChatId,
    resolveSettingsSection,
    resolveSidebarPage,
} from './server-route-state.ts';

describe('Server route state', () => {
    test('returns directly to the remembered Chat from a full-width destination', () => {
        const chats = [
            { id: 'chat-all', isAll: true },
            { id: 'chat-product', isAll: false },
        ] as Chat[];

        expect(resolveChatSectionRoute(chats, 'chat-product', 'dev')).toBe(
            '/s/dev/chats/chat-product'
        );
        expect(resolveChatSectionRoute(chats, 'deleted-chat', 'dev')).toBe('/s/dev/chats/chat-all');
        expect(resolveChatSectionRoute([], null, 'dev')).toBe('/s/dev');
    });

    test('treats removed overview routes as Chat entry paths', () => {
        expect(resolveActiveSection('/s/dev/design/brief', 'dev')).toBe('chat');
    });

    test('reads the selected Chat and settings section from the current Server path', () => {
        expect(resolveSelectedChatId('/s/dev/chats/chat%2Fone', 'dev')).toBe('chat/one');
        expect(resolveSettingsSection('/s/dev/settings/preferences', 'dev')).toBe('preferences');
    });

    test('routes the Server Activity page to its own section, beside the chat navigation', () => {
        expect(resolveActiveSection('/s/dev/activity', 'dev')).toBe('activity');
        expect(resolveActiveSection('/s/dev/activity?agents=agt_tiny', 'dev')).toBe('activity');
        expect(resolveSidebarPage('activity')).toBe('server');
    });

    test("keeps the chat navigation on an Agent's own page", () => {
        expect(resolveActiveSection('/s/dev/agents/agt_blippy/overview', 'dev')).toBe('agent');
        expect(
            resolveSidebarPage(resolveActiveSection('/s/dev/agents/agt_blippy/tools', 'dev'))
        ).toBe('server');
    });

    test('routes legacy computers paths to the settings section', () => {
        expect(resolveActiveSection('/s/dev/computers', 'dev')).toBe('settings');
        expect(resolveActiveSection('/s/dev/settings/computers', 'dev')).toBe('settings');
    });

    // Usage left the shell for Settings so the settings rail stays on arrival.
    test('keeps the settings sidebar on the Usage section', () => {
        expect(resolveSidebarPage(resolveActiveSection('/s/dev/settings/usage', 'dev'))).toBe(
            'settings'
        );
    });
});

test('an Agent address names the Agent and section a desktop tab opens', () => {
    expect(resolveAgentProfileTarget('/s/acme/agents/blippy/skills', 'acme')).toEqual({
        agentId: 'blippy',
        section: 'skills',
    });
    expect(resolveAgentProfileTarget('/s/acme/agents/a%20b', 'acme')).toEqual({
        agentId: 'a b',
        section: 'home',
    });
    expect(resolveAgentProfileTarget('/s/acme/members/agents/tiny/overview', 'acme')).toEqual({
        agentId: 'tiny',
        section: 'home',
    });
    expect(
        resolveAgentProfileTarget('/s/acme/settings/members/agents/tiny/skills', 'acme')
    ).toEqual({ agentId: 'tiny', section: 'skills' });
    expect(resolveAgentProfileTarget('/s/acme/settings/agents/tiny', 'acme')).toBeNull();
    expect(resolveAgentProfileTarget('/s/acme/chats/c1', 'acme')).toBeNull();
    expect(resolveAgentProfileTarget('/s/other/agents/blippy', 'acme')).toBeNull();
});

test('a malformed Agent address names no Agent instead of throwing', () => {
    expect(resolveAgentProfileTarget('/s/acme/agents/%E0', 'acme')).toBeNull();
});
