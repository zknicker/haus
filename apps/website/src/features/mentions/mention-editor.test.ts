import { expect, test } from 'vitest';
import { isMentionEditorLineBreakShortcut } from './mention-editor.tsx';

test('mention editor inserts a line break for Shift+Enter', () => {
    expect(
        isMentionEditorLineBreakShortcut({
            isComposing: false,
            key: 'Enter',
            shiftKey: true,
        })
    ).toBe(true);
    expect(
        isMentionEditorLineBreakShortcut({
            isComposing: true,
            key: 'Enter',
            shiftKey: true,
        })
    ).toBe(false);
    expect(
        isMentionEditorLineBreakShortcut({
            isComposing: false,
            key: 'Enter',
            shiftKey: false,
        })
    ).toBe(false);
});
