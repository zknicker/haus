import { describe, expect, test } from 'bun:test';
import { type LibrarySelection, librarySelectionProps } from './library-selection.ts';

function selectionAt(selectedKey: string | null) {
    const picks: (string | null)[] = [];
    const selection: LibrarySelection = { onSelect: (key) => picks.push(key), selectedKey };
    return { picks, selection };
}

describe('librarySelectionProps', () => {
    test('uses replace selection, so a click selects and double click or Return opens', () => {
        const { selection } = selectionAt(null);
        const props = librarySelectionProps(selection, ['a']);
        expect(props.selectionMode).toBe('single');
        expect(props.selectionBehavior).toBe('replace');
    });

    test('shows the shared selection only in the collection that owns it', () => {
        const { selection } = selectionAt('folder-b');
        expect(librarySelectionProps(selection, ['folder-a', 'folder-b']).selectedKeys).toEqual([
            'folder-b',
        ]);
        expect(librarySelectionProps(selection, ['file-1']).selectedKeys).toEqual([]);
    });

    test('selecting in one collection replaces the selection everywhere', () => {
        const { picks, selection } = selectionAt('folder-a');
        librarySelectionProps(selection, ['file-1']).onSelectionChange(new Set(['file-1']));
        expect(picks).toEqual(['file-1']);
    });

    test('a collection clears only its own selection', () => {
        const owned = selectionAt('file-1');
        librarySelectionProps(owned.selection, ['file-1']).onSelectionChange(new Set());
        expect(owned.picks).toEqual([null]);

        const elsewhere = selectionAt('folder-a');
        librarySelectionProps(elsewhere.selection, ['file-1']).onSelectionChange(new Set());
        expect(elsewhere.picks).toEqual([]);
    });
});
