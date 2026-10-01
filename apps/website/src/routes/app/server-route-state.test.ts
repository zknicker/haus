import { describe, expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import {
    resolveActiveSection,
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
        expect(resolveActiveSection('/s/dev/activity', 'dev')).toBe('chat');
        expect(resolveActiveSection('/s/dev/design/brief', 'dev')).toBe('chat');
    });

    test('reads the selected Chat and settings section from the current Server path', () => {
        expect(resolveSelectedChatId('/s/dev/chats/chat%2Fone', 'dev')).toBe('chat/one');
        expect(resolveSettingsSection('/s/dev/settings/preferences', 'dev')).toBe('preferences');
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
