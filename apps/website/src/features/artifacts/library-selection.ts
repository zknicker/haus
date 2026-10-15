import type { Key, PressEvent, Selection } from 'react-aria-components';
import { openIntentFromEvent } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useTabId } from '../../hooks/desktop-tabs/tab-presence.ts';

/**
 * The library's one Finder-style selection, shared by the folder tiles and
 * every date group of files, so selecting anywhere clears the rest. Owned by
 * the open folder's content; a new folder starts with nothing selected.
 */
export interface LibrarySelection {
    onSelect: (key: string | null) => void;
    selectedKey: string | null;
}

/**
 * React Aria's `replace` selection gives Finder's gestures for free: a mouse
 * click selects, a double click or Return performs the collection's action
 * (open), arrow keys move the selection, and a touch tap (or pen) opens
 * directly. `ids` are this collection's keys, so it shows the shared
 * selection only when the selected item is one of its own.
 */
export function librarySelectionProps(selection: LibrarySelection, ids: readonly Key[]) {
    const owns = (key: string | null) => key !== null && ids.includes(key);
    return {
        onSelectionChange: (keys: Selection) => {
            const [key] = keys === 'all' ? [] : [...keys];
            if (key !== undefined) {
                selection.onSelect(String(key));
            } else if (owns(selection.selectedKey)) {
                selection.onSelect(null);
            }
        },
        selectedKeys: owns(selection.selectedKey) ? [selection.selectedKey as string] : [],
        selectionBehavior: 'replace' as const,
        selectionMode: 'single' as const,
    };
}

/**
 * Command-, Shift-, or Control-click (off macOS) on a desktop row still opens
 * it in a new tab (ADR 0046), though a plain click only selects. The web has
 * no tabs to open, so there a modified click just selects. Returns each
 * item's `onPress`.
 */
export function useOpenInTabPress() {
    const inTab = useTabId() !== null;
    return (onOpen: () => void): ((event: PressEvent) => void) | undefined =>
        inTab
            ? (event) => {
                  if (event.pointerType === 'mouse' && openIntentFromEvent(event) !== 'auto') {
                      onOpen();
                  }
              }
            : undefined;
}
