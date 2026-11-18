import { describe, expect, test } from 'bun:test';
import { getRouteTab, routeTabs } from './use-route-tab.ts';

describe('app route tab', () => {
    test('exposes the shell tabs in rail order', () => {
        expect(routeTabs).toEqual([
            { id: 'search', label: 'Search', path: '/search' },
            { id: 'chat', label: 'Chat', path: '/chats' },
            { id: 'activity', label: 'Activity', path: '/activity' },
            { id: 'inbox', label: 'Inbox', path: '/inbox' },
            { id: 'tasks', label: 'Tasks', path: '/tasks' },
            { id: 'artifacts', label: 'Files', path: '/artifacts' },
            { id: 'members', label: 'Members', path: '/settings/members' },
        ]);
    });

    test('returns the matching app tab for primary routes', () => {
        expect(getRouteTab('/search')).toBe('search');
        expect(getRouteTab('/chats')).toBe('chat');
        expect(getRouteTab('/chats/chat_123')).toBe('chat');
        expect(getRouteTab('/activity')).toBe('activity');
        expect(getRouteTab('/inbox')).toBe('inbox');
        expect(getRouteTab('/tasks')).toBe('tasks');
        // Members lives under Settings now, so it is no longer a top-level tab.
        expect(getRouteTab('/settings/members')).toBeNull();
    });

    test('keeps dashboard tab detection during redirects', () => {
        expect(getRouteTab('/dashboard/activity')).toBe('activity');
        expect(getRouteTab('/dashboard/chats/chat_123')).toBe('chat');
    });

    test('returns null when no app tab is active', () => {
        expect(getRouteTab('/agent')).toBeNull();
        expect(getRouteTab('/stats')).toBeNull();
        expect(getRouteTab('/skills')).toBeNull();
        expect(getRouteTab('/settings')).toBeNull();
        expect(getRouteTab('/settings/theme')).toBeNull();
        expect(getRouteTab('/overview')).toBeNull();
        expect(getRouteTab('/wiki')).toBeNull();
    });
});
