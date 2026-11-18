import { expect, test } from 'vitest';
import {
    composerEditorHeightIsMultiline,
    composerEditorMotionDelta,
    resolveCompactComposerExpansion,
} from './use-compact-composer-layout.ts';

test('inverts the editor layout shift so its visual position stays continuous', () => {
    expect(
        composerEditorMotionDelta({
            destination: { left: 48, top: 666 },
            origin: { left: 136, top: 735 },
        })
    ).toEqual({ x: 88, y: 69 });
});

test('detects when editor content exceeds one line', () => {
    expect(composerEditorHeightIsMultiline({ height: 20, lineHeight: 20 })).toBe(false);
    expect(composerEditorHeightIsMultiline({ height: 28, lineHeight: 20 })).toBe(false);
    expect(composerEditorHeightIsMultiline({ height: 30, lineHeight: 20 })).toBe(false);
    expect(composerEditorHeightIsMultiline({ height: 40, lineHeight: 20 })).toBe(true);
});

test('expands only while content needs more than one compact line', () => {
    expect(
        resolveCompactComposerExpansion({
            hasText: true,
            isForcedExpanded: false,
            isMultiline: false,
        })
    ).toBe(false);
    expect(
        resolveCompactComposerExpansion({
            hasText: true,
            isForcedExpanded: false,
            isMultiline: true,
        })
    ).toBe(true);
    expect(
        resolveCompactComposerExpansion({
            hasText: false,
            isForcedExpanded: false,
            isMultiline: false,
        })
    ).toBe(false);
});

test('attachments force expansion independently of text wrapping', () => {
    expect(
        resolveCompactComposerExpansion({
            hasText: false,
            isForcedExpanded: true,
            isMultiline: false,
        })
    ).toBe(true);
    expect(
        resolveCompactComposerExpansion({
            hasText: true,
            isForcedExpanded: true,
            isMultiline: false,
        })
    ).toBe(true);
    expect(
        resolveCompactComposerExpansion({
            hasText: true,
            isForcedExpanded: false,
            isMultiline: false,
        })
    ).toBe(false);
    expect(
        resolveCompactComposerExpansion({
            hasText: true,
            isForcedExpanded: false,
            isMultiline: true,
        })
    ).toBe(true);
});
