import { describe, expect, test } from 'bun:test';
import { numberedTab, relativeTab } from './strip-navigation.ts';
import { primaryTabRef, type WorkspaceTabRef } from './workspace-tabs-model.ts';

const b1: WorkspaceTabRef = { kind: 'browser', id: 'b1' };
const doc: WorkspaceTabRef = { kind: 'artifact', key: 'doc' };
const b2: WorkspaceTabRef = { kind: 'browser', id: 'b2' };
// The primary tab dragged into the middle of the strip.
const strip = [b1, primaryTabRef, doc, b2];

describe('strip navigation follows the actual strip order', () => {
    test('next and previous step through the primary tab wherever it sits, wrapping', () => {
        expect(relativeTab(strip, b1, 1)).toEqual(primaryTabRef);
        expect(relativeTab(strip, primaryTabRef, 1)).toEqual(doc);
        expect(relativeTab(strip, doc, -1)).toEqual(primaryTabRef);
        expect(relativeTab(strip, b2, 1)).toEqual(b1);
        expect(relativeTab(strip, b1, -1)).toEqual(b2);
        expect(relativeTab([primaryTabRef], primaryTabRef, 1)).toEqual(primaryTabRef);
    });

    test('numbers select by strip position; 9 selects the last tab', () => {
        expect(numberedTab(strip, 1)).toEqual(b1);
        expect(numberedTab(strip, 2)).toEqual(primaryTabRef);
        expect(numberedTab(strip, 4)).toEqual(b2);
        expect(numberedTab(strip, 5)).toBeNull();
        expect(numberedTab(strip, 9)).toEqual(b2);
    });
});
