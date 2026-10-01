import { describe, expect, test } from 'bun:test';
import { numberedTab, relativeTab } from './strip-navigation.ts';
import { primaryTabRef, type WorkspaceTabRef } from './workspace-tabs-model.ts';

const b1: WorkspaceTabRef = { kind: 'browser', id: 'b1' };
const doc: WorkspaceTabRef = { kind: 'artifact', key: 'doc' };
const b2: WorkspaceTabRef = { kind: 'browser', id: 'b2' };
// The expanded strip: the primary tab first.
const strip = [primaryTabRef, b1, doc, b2];

describe('strip navigation follows the visible strip', () => {
    test('next and previous step through the strip, wrapping', () => {
        expect(relativeTab(strip, primaryTabRef, 1)).toEqual(b1);
        expect(relativeTab(strip, doc, -1)).toEqual(b1);
        expect(relativeTab(strip, b2, 1)).toEqual(primaryTabRef);
        expect(relativeTab(strip, primaryTabRef, -1)).toEqual(b2);
        expect(relativeTab([primaryTabRef], primaryTabRef, 1)).toEqual(primaryTabRef);
    });

    test('from the routed page beside the side pane strip, next is first and previous last', () => {
        const side = [b1, doc, b2];
        expect(relativeTab(side, primaryTabRef, 1)).toEqual(b1);
        expect(relativeTab(side, primaryTabRef, -1)).toEqual(b2);
        expect(relativeTab([], primaryTabRef, 1)).toBeNull();
    });

    test('numbers select by strip position; 9 selects the last tab', () => {
        expect(numberedTab(strip, 1)).toEqual(primaryTabRef);
        expect(numberedTab(strip, 2)).toEqual(b1);
        expect(numberedTab(strip, 4)).toEqual(b2);
        expect(numberedTab(strip, 5)).toBeNull();
        expect(numberedTab(strip, 9)).toEqual(b2);
    });
});
