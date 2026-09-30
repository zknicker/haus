import * as React from 'react';
import type { BrowserCommand } from '../../lib/desktop-browser.ts';

export interface BrowserFind {
    close: () => void;
    /** Bumps on every open request so the bar can refocus and select its field. */
    focusRequest: number;
    /** Opens the bar on the selected browser tab, re-running the last search. */
    open: () => void;
    setText: (text: string) => void;
    /** Steps to the next or previous match; opens the bar first when it is closed. */
    step: (forward: boolean) => void;
    /** The tab the bar is open on, or null while closed. */
    tabId: string | null;
    text: string;
}

/**
 * Find in page for the selected browser tab. The bar belongs to one tab and
 * closes (clearing highlights) when another tab is selected. The last search
 * text survives closing, like Chrome.
 */
export function useBrowserFind(
    activeId: string | null,
    command: (input: BrowserCommand) => void
): BrowserFind {
    const [state, setState] = React.useState({ tabId: null as string | null, text: '' });
    const [focusRequest, setFocusRequest] = React.useState(0);
    const latest = React.useRef({ activeId, ...state });
    latest.current = { activeId, ...state };

    const search = React.useCallback(
        (id: string, text: string, forward: boolean, newSession: boolean) => {
            if (text) {
                command({ kind: 'find', id, text, forward, newSession });
            } else {
                command({ kind: 'stop-find', id });
            }
        },
        [command]
    );
    const open = React.useCallback(() => {
        const current = latest.current;
        if (!current.activeId) {
            return;
        }
        setFocusRequest((value) => value + 1);
        if (current.tabId === current.activeId) {
            return;
        }
        setState({ tabId: current.activeId, text: current.text });
        if (current.text) {
            search(current.activeId, current.text, true, true);
        }
    }, [search]);
    const close = React.useCallback(() => {
        const { tabId } = latest.current;
        if (tabId) {
            command({ kind: 'stop-find', id: tabId });
            setState((value) => ({ ...value, tabId: null }));
        }
    }, [command]);
    const setText = React.useCallback(
        (text: string) => {
            const { tabId } = latest.current;
            setState((value) => ({ ...value, text }));
            if (tabId) {
                search(tabId, text, true, true);
            }
        },
        [search]
    );
    const step = React.useCallback(
        (forward: boolean) => {
            const { tabId, text } = latest.current;
            if (!tabId) {
                open();
            } else if (text) {
                search(tabId, text, forward, false);
            }
        },
        [open, search]
    );

    React.useEffect(() => {
        const { tabId } = latest.current;
        if (tabId && tabId !== activeId) {
            command({ kind: 'stop-find', id: tabId });
            setState((value) => ({ ...value, tabId: null }));
        }
    }, [activeId, command]);

    return React.useMemo(
        () => ({ close, focusRequest, open, setText, step, tabId: state.tabId, text: state.text }),
        [close, focusRequest, open, setText, step, state.tabId, state.text]
    );
}
