import type { PressEvent, Selection } from 'react-aria-components';

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
 * range gestures: Command-click toggles, Shift-click and Shift+Arrow extend a
 * range in the collection's visual order, Command-A selects everything, Escape
 * clears, Return performs the collection's action (open), and a touch tap opens
 * while a long press starts selecting. A plain click opens, as in Capy
 * (`useLibraryItemPress`).
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
 * A plain mouse click on a folder or file opens it; Command- and Shift-click
 * shape the selection instead. Keyboard and touch already open through the
 * collection's action. On desktop the window relays a middle click as a plain
 * click whose open gesture is a background tab, so it still opens there
 * (ADR 0046). The second press of a double click lands, at the same spot, on
 * whatever replaced the item, so a press that quick and that close to the last
 * open is ignored (`isDoubleClickEcho`). Returns each item's `onPress`.
 */
export function useLibraryItemPress() {
    return (onOpen: () => void) => (event: PressEvent) => {
        const modified = event.metaKey || event.ctrlKey || event.shiftKey;
        if (modified || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) {
            return;
        }
        const box = event.target.getBoundingClientRect();
        const press = { at: performance.now(), x: box.left + event.x, y: box.top + event.y };
        const echo = isDoubleClickEcho(lastOpen, press);
        lastOpen = press;
        if (!echo) {
            onOpen();
        }
    };
}

export interface LibraryPressPoint {
    at: number;
    x: number;
    y: number;
}

export function isDoubleClickEcho(previous: LibraryPressPoint | null, press: LibraryPressPoint) {
    return (
        previous !== null &&
        press.at - previous.at < doubleClickMs &&
        Math.hypot(press.x - previous.x, press.y - previous.y) <= doubleClickSlop
    );
}

const doubleClickMs = 500;
const doubleClickSlop = 4;
let lastOpen: LibraryPressPoint | null = null;
