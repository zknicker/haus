import * as React from 'react';
import { lastLibraryItem } from './library-focus.ts';
import type { LibrarySelection } from './library-selection.ts';

/** About a second of frames to hold a hand-off's focus while the page settles. */
const focusFrames = 60;

interface Pick {
    /** Focus the item once it is on screen: a hand-off back into the library. */
    focus: boolean;
    folder: string;
    key: string | null;
}

/**
 * The library's one selection, owned per open folder. A folder opens with the
 * item it last handed off selected (the file Back returns from, or the one
 * Show in folder points at) and focuses that item once its row or tile is on
 * screen, so the keyboard picks up where it left. A click selects without
 * moving focus anywhere new.
 */
export function useLibraryPick(
    folder: string,
    root: React.RefObject<HTMLElement | null>,
    /** The loaded items; a change retries a focus whose item was not on screen yet. */
    items: unknown
): LibrarySelection & { pick: (folder: string, key: string) => void } {
    const [picked, setPicked] = React.useState<Pick>(() => ({
        focus: true,
        folder,
        key: lastLibraryItem(folder),
    }));
    const current: Pick =
        picked.folder === folder ? picked : { focus: true, folder, key: lastLibraryItem(folder) };

    React.useEffect(() => {
        if (!(current.focus && current.key && items)) {
            return;
        }
        const selector = `[data-key="${CSS.escape(current.key)}"]`;
        const settle = () => setPicked({ focus: false, folder: current.folder, key: current.key });
        let frame = 0;
        let tries = 0;
        let placed = false;
        // The page is still settling when the rows first commit (a background refetch can
        // replace a row's element), so for a moment focus is put back whenever it falls to the
        // body. Focus anywhere else is the member's own and ends the hand-off.
        const hold = () => {
            const active = document.activeElement;
            const element = root.current?.querySelector(selector);
            if (placed && active !== element && active !== document.body && active !== null) {
                settle();
                return;
            }
            if (element instanceof HTMLElement && active !== element) {
                element.focus({ preventScroll: placed });
                if (!placed && document.activeElement === element) {
                    placed = true;
                    element.scrollIntoView({ block: 'nearest' });
                }
            }
            tries += 1;
            if (tries < focusFrames) {
                frame = requestAnimationFrame(hold);
            } else {
                settle();
            }
        };
        hold();
        return () => cancelAnimationFrame(frame);
    }, [current.focus, current.folder, current.key, items, root]);

    return {
        onSelect: (key) => setPicked({ focus: false, folder, key }),
        pick: (next, key) => setPicked({ focus: true, folder: next, key }),
        selectedKey: current.key,
    };
}
