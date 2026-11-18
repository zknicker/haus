import * as React from 'react';
import { useDesktopTabCommands } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentEntry } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';

const saveDelayMs = 200;
const restoreFrames = 30;
/** The chat transcript's scroller, which `ChatScrollPositionMemory` alone restores. */
const transcriptSelector = '[data-slot="message-scroller-viewport"]';

/**
 * Keeps a tab page's scroll position in its history entry (`TabPageState`).
 * A hidden tab's DOM loses its scroll offset, and an evicted tab rebuilds from
 * history, so the frame restores the saved offset whenever the page shows.
 *
 * It listens in the capture phase on the frame, so it follows whichever
 * element the page scrolls (a page column) without the page knowing. A chat
 * transcript is not its: the transcript restores its own row anchor before
 * paint, and a second, pixel-offset restorer would fight it.
 */
export function useTabScrollMemory(
    frame: React.RefObject<HTMLElement | null>,
    { entryKey, shown, tabId }: { entryKey: string; shown: boolean; tabId: string }
) {
    const tabs = useDesktopTabCommands();
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const scroller = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
        const root = frame.current;
        if (!root) {
            return;
        }
        let pending: number | null = null;
        let saved: number | undefined;
        const flush = () => {
            pending = null;
            const tab = latest.current.tab(tabId);
            // A navigation already moved the tab to another entry: this offset is not its.
            if (tab && currentEntry(tab).key === entryKey) {
                latest.current.savePageState(
                    tabId,
                    saved === undefined ? {} : { scrollTop: saved }
                );
            }
        };
        const onScroll = (event: Event) => {
            if (
                !(event.target instanceof HTMLElement) ||
                event.target.matches(transcriptSelector)
            ) {
                return;
            }
            scroller.current = event.target;
            saved = event.target.scrollTop;
            if (pending !== null) {
                window.clearTimeout(pending);
            }
            pending = window.setTimeout(flush, saveDelayMs);
        };
        root.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => {
            root.removeEventListener('scroll', onScroll, { capture: true });
            if (pending !== null) {
                window.clearTimeout(pending);
                flush();
            }
        };
    }, [entryKey, frame, tabId]);

    React.useLayoutEffect(() => {
        const root = frame.current;
        const tab = latest.current.tab(tabId);
        const entry = tab ? currentEntry(tab) : null;
        // Restores on reveal and whenever the tab moves to another entry (Back lands where you were).
        const scrollTop = entry?.key === entryKey ? entry.pageState.scrollTop : undefined;
        if (!(shown && root) || scrollTop === undefined) {
            return;
        }
        return restoreOffset(root, scroller.current, scrollTop);
    }, [entryKey, frame, shown, tabId]);
}

/** Content arrives after mount, so retry for a few frames until the offset fits. */
function restoreOffset(root: HTMLElement, remembered: HTMLElement | null, scrollTop: number) {
    let frames = 0;
    let handle = 0;
    const attempt = () => {
        const target = remembered && root.contains(remembered) ? remembered : null;
        if (target && target.scrollHeight - target.clientHeight >= scrollTop) {
            target.scrollTop = scrollTop;
            return;
        }
        frames += 1;
        if (frames < restoreFrames) {
            handle = window.requestAnimationFrame(attempt);
        }
    };
    attempt();
    return () => window.cancelAnimationFrame(handle);
}
