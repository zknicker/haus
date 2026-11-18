import { expect, test } from 'bun:test';
import type { Modifier } from '@dnd-kit/core';
import { channelListModifiers } from './channel-drag-modifiers.ts';

test('keeps channel dragging inside the list bounds', () => {
    expect(applyModifiers({ x: 20, y: -50 })).toMatchObject({ x: 0, y: -20 });
    expect(applyModifiers({ x: 20, y: 200 })).toMatchObject({ x: 0, y: 40 });
});

test('preserves vertical movement within the list', () => {
    expect(applyModifiers({ x: 20, y: 15 })).toMatchObject({ x: 0, y: 15 });
});

function applyModifiers(transform: { x: number; y: number }) {
    const args: Parameters<Modifier>[0] = {
        activatorEvent: null,
        active: null,
        activeNodeRect: null,
        containerNodeRect: rect(80, 90),
        draggingNodeRect: rect(100, 30),
        over: null,
        overlayNodeRect: null,
        scrollableAncestorRects: [],
        scrollableAncestors: [],
        transform: { ...transform, scaleX: 1, scaleY: 1 },
        windowRect: null,
    };

    return channelListModifiers.reduce(
        (current, modifier) => modifier({ ...args, transform: current }),
        args.transform
    );
}

function rect(top: number, height: number) {
    return { bottom: top + height, height, left: 0, right: 220, top, width: 220 };
}
