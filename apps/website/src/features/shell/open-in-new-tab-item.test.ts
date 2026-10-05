import { describe, expect, it, mock } from 'bun:test';
import { resolveTabNavigation } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { newTabOpener } from './open-in-new-tab-item.tsx';

describe('newTabOpener', () => {
    it('is absent on the web, which has no tabs', () => {
        expect(newTabOpener(null)).toBeNull();
    });

    it('opens the row in a background tab exactly as a Command-click on the row does', () => {
        const openInFocusedPane = mock(() => undefined);
        newTabOpener({ openInFocusedPane })?.('/s/demo/chats/c1');

        const commandClick = resolveTabNavigation({
            from: { kind: 'app', path: '/s/demo' },
            intent: 'backgroundTab',
            mode: 'push',
            policy: 'shell',
            to: { kind: 'app', path: '/s/demo/chats/c1' },
        });
        expect(commandClick).toEqual({ intent: 'backgroundTab', kind: 'openInFocusedPane' });
        expect(openInFocusedPane).toHaveBeenCalledWith(
            { kind: 'app', path: '/s/demo/chats/c1' },
            'backgroundTab'
        );
    });
});
