import * as React from 'react';
import type { Selection } from 'react-aria-components';
import { lastLibraryItem } from './library-focus.ts';
import type { LibrarySelection } from './library-selection.ts';

/** About a second of frames to hold a hand-off's focus while the page settles. */
const focusFrames = 60;

interface Picked {
    /** Focus this item once it is on screen: a hand-off back into the library. */
    focus: string | null;
    folder: string;
    keys: Selection;
}

/**
 * The library's one selection, owned per open folder: opening another folder
 * starts over. A folder opens with the item it last handed off selected (the
 * file Back returns from, or the one Show in folder points at) and focuses
 * that item once its row or tile is on screen, so the keyboard picks up where
 * it left. Clicks change the selection without moving focus anywhere new.
 */
export function useLibrarySelection(
    folder: string,
    root: React.RefObject<HTMLElement | null>,
    /** The loaded items; a change retries a focus whose item was not on screen yet. */
    items: unknown
): LibrarySelection & { pick: (folder: string, key: string) => void } {
    const [picked, setPicked] = React.useState<Picked>(() => handoff(folder));
    const opened = React.useMemo(() => handoff(folder), [folder]);
    const current: Picked = picked.folder === folder ? picked : opened;

    React.useEffect(() => {
        if (!(current.focus && items)) {
            return;
        }
        const selector = `[data-key="${CSS.escape(current.focus)}"]`;
        const settle = () =>
            setPicked((state) =>
                state.folder === current.folder
                    ? { ...state, focus: null }
                    : { folder: current.folder, focus: null, keys: current.keys }
            );
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
    }, [current.focus, current.folder, current.keys, items, root]);

    return {
        clear: () => setPicked({ folder, focus: null, keys: new Set() }),
        keys: current.keys,
        onChange: (keys) => setPicked({ folder, focus: null, keys }),
        pick: (next, key) => setPicked({ folder: next, focus: key, keys: new Set([key]) }),
    };
}

function handoff(folder: string): Picked {
    const key = lastLibraryItem(folder);
    return { folder, focus: key, keys: new Set(key ? [key] : []) };
}
