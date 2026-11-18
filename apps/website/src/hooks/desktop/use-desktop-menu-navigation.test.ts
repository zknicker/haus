import { describe, expect, test } from 'bun:test';
import { mouseHistoryDirection } from './use-desktop-menu-navigation.ts';

describe('mouseHistoryDirection', () => {
    test('maps the mouse back and forward buttons', () => {
        expect(mouseHistoryDirection(3)).toBe('back');
        expect(mouseHistoryDirection(4)).toBe('forward');
    });

    test('ignores the primary, middle, and secondary buttons', () => {
        expect(mouseHistoryDirection(0)).toBeNull();
        expect(mouseHistoryDirection(1)).toBeNull();
        expect(mouseHistoryDirection(2)).toBeNull();
    });
});
