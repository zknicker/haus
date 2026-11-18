import { useEffect } from 'react';
import { useTabPresence } from '../desktop-tabs/tab-presence.ts';

const baseTitle = 'Haus';

/**
 * Titles the window/tab "<title> — Haus" while mounted. Electron windows
 * follow document.title, so this names windows in the Window menu, ⌘`
 * cycling, and Mission Control.
 */
export function useWindowTitle(title: string | null | undefined) {
    useEffect(() => {
        if (!title) {
            return;
        }

        document.title = `${title} — ${baseTitle}`;
        return () => {
            document.title = baseTitle;
        };
    }, [title]);
}

/**
 * Titles the window while its page is shown. For a view kept mounted while
 * hidden (`KeptChatViews`): only the shown view names the window, and a
 * revealed view retitles it. A leaf, so a presence flip re-renders only this.
 */
export function WindowTitle({ title }: { title: string }) {
    const shown = useTabPresence().shown;
    useWindowTitle(shown ? title : null);
    return null;
}
