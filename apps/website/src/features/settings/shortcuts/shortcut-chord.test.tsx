import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { chordLabel, ShortcutChord } from './shortcut-chord.tsx';

const reopenTab = { key: 'T', modifiers: ['command', 'shift'] } as const;

describe('shortcut chords', () => {
    test('name modifiers in Mac order, or as Ctrl elsewhere', () => {
        expect(chordLabel(reopenTab, true)).toBe('Shift Command T');
        expect(chordLabel(reopenTab, false)).toBe('Shift Ctrl T');
        expect(chordLabel({ key: 'left', modifiers: ['command', 'option'] }, true)).toBe(
            'Option Command Left Arrow'
        );
        expect(chordLabel({ key: 'enter', modifiers: [] }, true)).toBe('Return');
    });

    test('draw Mac modifiers as symbols and other platforms as words', () => {
        const mac = renderToStaticMarkup(<ShortcutChord chord={reopenTab} isMac />);
        expect(mac).toContain('⇧');
        expect(mac).toContain('⌘');
        const other = renderToStaticMarkup(<ShortcutChord chord={reopenTab} isMac={false} />);
        expect(other).toContain('Ctrl');
        expect(other).not.toContain('⌘');
    });
});
