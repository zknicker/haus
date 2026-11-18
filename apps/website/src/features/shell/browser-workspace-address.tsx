import { ComboBox, Input, ListBox } from '@heroui/react';
import * as React from 'react';
import { ComboBoxStateContext, type Key } from 'react-aria-components';
import {
    type BrowserHistoryEntry,
    removeBrowserHistoryEntry,
} from '../../hooks/browser/use-browser-history.ts';
import { BrowserAddressSuggestionRow } from './browser-address-suggestion-row.tsx';
import { selectBrowserAddressSuggestions } from './browser-address-suggestions.ts';

/**
 * The page address. At rest it shows the condensed label; focusing it swaps in the full URL, fully
 * selected, and lists recent history. Typing puts "Go to" or "Search" first, highlighted, with
 * matching history below. Enter or a click navigates and returns the field to rest; Escape
 * restores the URL and closes the list; Shift-Delete forgets a highlighted history row.
 */
export function BrowserWorkspaceAddress({
    address,
    editing,
    history,
    onChange,
    onEdit,
    onRest,
    onNavigate,
    id,
}: {
    address: string;
    editing: boolean;
    history: BrowserHistoryEntry[];
    onChange: (value: string) => void;
    /** Enter editing with the full URL, discarding any draft. */
    onEdit: () => void;
    onRest: () => void;
    onNavigate: (value: string) => void;
    /** The field's element id, unique per view so ⌘L finds the focused pane's field. */
    id: string;
}) {
    const input = React.useRef<HTMLInputElement>(null);
    const focusedByPointer = React.useRef(false);
    // Real focus only: React Aria re-dispatches focus on the field whenever the highlight clears.
    const focused = React.useRef(false);
    const tabbing = React.useRef(false);
    // Untouched, the field holds the page URL, so recent history can leave that page out.
    const [typed, setTyped] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(false);
    React.useLayoutEffect(() => {
        if (editing) {
            input.current?.select();
        }
    }, [editing]);
    const suggestions = React.useMemo(() => {
        // An empty field sits on the new tab page, which already lists recent sites.
        if (!editing || dismissed || (!typed && address === '')) {
            return [];
        }
        return selectBrowserAddressSuggestions({
            history,
            pageUrl: address,
            query: typed ? address : null,
        });
    }, [address, dismissed, editing, history, typed]);
    const navigate = (value: string) => {
        onNavigate(value);
        input.current?.blur();
    };
    const forget = (event: React.KeyboardEvent, highlighted: string | null) => {
        const suggestion = suggestions.find((row) => row.id === highlighted);
        if (suggestion?.kind === 'history') {
            event.preventDefault();
            removeBrowserHistoryEntry(suggestion.entry.url);
        }
    };
    const restore = () => {
        onEdit();
        setTyped(false);
        requestAnimationFrame(() => input.current?.select());
    };
    return (
        <ComboBox
            allowsCustomValue
            aria-label="Page address"
            className="browser-address"
            fullWidth
            inputValue={address}
            items={suggestions}
            menuTrigger="manual"
            onInputChange={(value) => {
                // React Aria can resync the text after blur; only the focused field edits the draft.
                if (document.activeElement === input.current) {
                    onChange(value);
                    setTyped(true);
                    setDismissed(false);
                }
            }}
            onSelectionChange={(key) => {
                // React Aria commits the highlighted row on Tab; Tab only moves focus here.
                const suggestion = suggestions.find((row) => row.id === key);
                if (suggestion && !tabbing.current) {
                    navigate(suggestion.value);
                }
            }}
            selectedKey={null}
        >
            <AddressMenuSync
                highlight={typed ? (suggestions[0]?.id ?? null) : null}
                open={suggestions.length > 0}
            />
            <Input
                id={id}
                onBlur={(event) => {
                    if (!movesIntoList(event)) {
                        focused.current = false;
                        onRest();
                    }
                }}
                onFocus={(event) => {
                    if (focused.current || movesIntoList(event)) {
                        return;
                    }
                    focused.current = true;
                    tabbing.current = false;
                    setTyped(false);
                    setDismissed(false);
                    if (!editing) {
                        onEdit();
                    }
                }}
                onKeyDown={(event) => {
                    const target = event.currentTarget;
                    const highlighted = highlightedKey(target);
                    if (
                        event.key === 'Enter' &&
                        !event.nativeEvent.isComposing &&
                        highlighted === null
                    ) {
                        event.preventDefault();
                        if (address.trim()) {
                            navigate(address.trim());
                        }
                    } else if (event.key === 'Escape') {
                        setDismissed(true);
                        if (typed || target.getAttribute('aria-expanded') !== 'true') {
                            restore();
                        }
                    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        setDismissed(false);
                    } else if (event.key === 'Delete' && event.shiftKey) {
                        forget(event, highlighted);
                    }
                }}
                onKeyDownCapture={(event) => {
                    // Runs before React Aria's own Tab handling, which commits the highlighted row.
                    tabbing.current = event.key === 'Tab';
                }}
                onMouseDown={() => {
                    focusedByPointer.current = !editing;
                }}
                onMouseUp={(event) => {
                    // Keep the select-all from focus; the click would otherwise drop a caret.
                    if (focusedByPointer.current) {
                        focusedByPointer.current = false;
                        event.preventDefault();
                    }
                }}
                placeholder="Search or enter a URL"
                ref={input}
            />
            <ComboBox.Popover className="browser-address-popover">
                <ListBox items={suggestions}>
                    {(suggestion) => <BrowserAddressSuggestionRow suggestion={suggestion} />}
                </ListBox>
            </ComboBox.Popover>
        </ComboBox>
    );
}

/**
 * Opens the list whenever there are rows (React Aria's own triggers only open on typing, and would
 * open an empty list on focus) and keeps `highlight` highlighted while nothing else is, so Enter
 * commits the first row. React Aria clears the highlight in an effect on every keystroke; a layout
 * effect restores it before that frame paints.
 */
function AddressMenuSync({ open, highlight }: { open: boolean; highlight: Key | null }) {
    const state = React.useContext(ComboBoxStateContext);
    React.useLayoutEffect(() => {
        if (!state) {
            return;
        }
        if (open !== state.isOpen) {
            if (open) {
                state.open(null, 'manual');
            } else {
                state.close();
            }
        }
        const focused = state.selectionManager.focusedKey;
        // A removed row leaves its key focused; fall back to the default highlight.
        if (
            open &&
            focused !== highlight &&
            (focused === null || !state.collection.getItem(focused))
        ) {
            state.selectionManager.setFocusedKey(highlight);
        }
    }, [highlight, open, state]);
    return null;
}

/**
 * React Aria highlights rows with virtual focus, dispatching synthetic blur and focus on the input
 * whose related target is a row. Real focus never leaves the field, so those must not end editing.
 * When the highlight clears it dispatches focus with no related target; the `focused` ref drops
 * that one, which would otherwise reset the typed list to recent history mid-word.
 */
function movesIntoList(event: React.FocusEvent) {
    const other = event.relatedTarget;
    return other instanceof Element && other.closest('[role="listbox"]') !== null;
}

/** The highlighted row's key, read from the input's active descendant. */
function highlightedKey(input: HTMLInputElement) {
    const id = input.getAttribute('aria-activedescendant');
    const row = id ? document.getElementById(id) : null;
    return row instanceof HTMLElement ? (row.dataset.key ?? null) : null;
}
