import { describe, expect, test } from 'bun:test';
import {
    handleCloseWindowRequest,
    handleNewTabRequest,
    registerDesktopTabPane,
} from './use-desktop-window-commands.ts';

describe('desktop window commands', () => {
    test('close falls back to closing the window with no pane registered', () => {
        let windowClosed = 0;
        handleCloseWindowRequest(() => {
            windowClosed += 1;
        });
        expect(windowClosed).toBe(1);
    });

    test('close routes to the registered pane and skips the window', () => {
        let tabClosed = 0;
        let windowClosed = 0;
        const unregister = registerDesktopTabPane({
            closeActiveTab: () => {
                tabClosed += 1;
                return true;
            },
            openNewTab: () => false,
        });

        try {
            handleCloseWindowRequest(() => {
                windowClosed += 1;
            });
            expect(tabClosed).toBe(1);
            expect(windowClosed).toBe(0);
        } finally {
            unregister();
        }
    });

    test('close falls through to the window when the pane declines', () => {
        let windowClosed = 0;
        const unregister = registerDesktopTabPane({
            closeActiveTab: () => false,
            openNewTab: () => false,
        });

        try {
            handleCloseWindowRequest(() => {
                windowClosed += 1;
            });
            expect(windowClosed).toBe(1);
        } finally {
            unregister();
        }
    });

    test('new tab routes to the registered tabs', () => {
        let tabOpened = 0;
        const unregister = registerDesktopTabPane({
            closeActiveTab: () => true,
            openNewTab: () => {
                tabOpened += 1;
                return true;
            },
        });
        try {
            handleNewTabRequest();
            expect(tabOpened).toBe(1);
        } finally {
            unregister();
        }
    });

    test('unregister restores the window fallback and new-tab becomes a no-op', () => {
        let tabOpened = 0;
        let windowClosed = 0;
        const unregister = registerDesktopTabPane({
            closeActiveTab: () => true,
            openNewTab: () => {
                tabOpened += 1;
                return true;
            },
        });
        unregister();

        handleNewTabRequest();
        handleCloseWindowRequest(() => {
            windowClosed += 1;
        });
        expect(tabOpened).toBe(0);
        expect(windowClosed).toBe(1);
    });

    test('a stale unregister does not clobber a newer pane registration', () => {
        let firstClosed = 0;
        let secondClosed = 0;
        const unregisterFirst = registerDesktopTabPane({
            closeActiveTab: () => {
                firstClosed += 1;
                return true;
            },
            openNewTab: () => false,
        });
        const unregisterSecond = registerDesktopTabPane({
            closeActiveTab: () => {
                secondClosed += 1;
                return true;
            },
            openNewTab: () => false,
        });

        try {
            unregisterFirst();
            handleCloseWindowRequest(() => {
                throw new Error('window should not close');
            });
            expect(firstClosed).toBe(0);
            expect(secondClosed).toBe(1);
        } finally {
            unregisterSecond();
        }
    });
});
