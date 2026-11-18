import { describe, expect, test } from 'bun:test';
import { getContextMenuDisposition } from './desktop-edit-context-menu.tsx';

describe('desktop edit context menu policy', () => {
    test('preserves product context menus that already handled the event', () => {
        expect(
            getContextMenuDisposition({
                defaultPrevented: true,
                hasDesktopBridge: true,
                hasEditableTarget: false,
                hasSelection: false,
            })
        ).toBe('ignore');
    });

    test('suppresses browser chrome on non-actionable app surfaces', () => {
        expect(
            getContextMenuDisposition({
                defaultPrevented: false,
                hasDesktopBridge: false,
                hasEditableTarget: false,
                hasSelection: false,
            })
        ).toBe('suppress-native');
    });

    test('uses the desktop edit menu for editable content and selections', () => {
        expect(
            getContextMenuDisposition({
                defaultPrevented: false,
                hasDesktopBridge: true,
                hasEditableTarget: true,
                hasSelection: false,
            })
        ).toBe('show-edit-menu');
        expect(
            getContextMenuDisposition({
                defaultPrevented: false,
                hasDesktopBridge: true,
                hasEditableTarget: false,
                hasSelection: true,
            })
        ).toBe('show-edit-menu');
    });

    test('preserves native edit commands in ordinary browser tabs', () => {
        expect(
            getContextMenuDisposition({
                defaultPrevented: false,
                hasDesktopBridge: false,
                hasEditableTarget: true,
                hasSelection: false,
            })
        ).toBe('ignore');
    });
});
