import type { PressEvent, Selection } from 'react-aria-components';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useTabId } from '../../hooks/desktop-tabs/tab-presence.ts';

/**
 * The library's one Finder-style selection over every folder tile and file
 * row, owned per open folder (`useLibrarySelection`). `all` is Command-A.
 */
export interface LibrarySelection {
    clear: () => void;
    keys: Selection;
    onChange: (keys: Selection) => void;
}

/**
 * React Aria's stock multiple selection with `replace` behavior gives Finder's
 * gestures: a click selects one item, Command-click toggles, Shift-click and
 * Shift+Arrow extend a range in the collection's visual order, Command-A
 * selects everything, Escape clears, a double click or Return performs the
 * collection's action (open), and a touch tap opens while a long press starts
 * selecting.
 */
export function librarySelectionProps(selection: LibrarySelection) {
    return {
        escapeKeyBehavior: 'clearSelection' as const,
        onSelectionChange: selection.onChange,
        selectedKeys: selection.keys,
        selectionBehavior: 'replace' as const,
        selectionMode: 'multiple' as const,
    };
}

/**
 * A middle click on a desktop row still opens it in a background tab
 * (ADR 0046). Command- and Shift-click now shape the selection, as in Finder,
 * so only the unmodified click the window relays for the middle button opens a
 * tab. The web has no tabs to open. Returns each item's `onPress`.
 */
export function useOpenInTabPress() {
    const inTab = useTabId() !== null;
    return (onOpen: () => void): ((event: PressEvent) => void) | undefined =>
        inTab
            ? (event) => {
                  const modified = event.metaKey || event.ctrlKey || event.shiftKey;
                  if (!modified && currentOpenGesture() === 'backgroundTab') {
                      onOpen();
                  }
              }
            : undefined;
}
