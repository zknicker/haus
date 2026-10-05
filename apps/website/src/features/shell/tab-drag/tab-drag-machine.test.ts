import { expect, test } from 'bun:test';
import type { BandLayout } from './tab-drag-geometry.ts';
import {
    idleTabDrag,
    stepTabDrag,
    type TabDragEvent,
    type TabDragState,
    type TabDragStep,
} from './tab-drag-machine.ts';

// One row of three 100px tabs a, b, c at 0, 104, 208, inside a 40px band.
const layout: BandLayout = {
    band: { bottom: 40, left: 0, right: 1200, top: 0 },
    rows: [
        {
            bounds: { bottom: 40, left: 0, right: 1200, top: 0 },
            gap: 4,
            port: { left: 0, right: 1200 },
            row: 'primary',
            start: 0,
            tabs: ['a', 'b', 'c'].map((id, index) => ({ id, left: index * 104, width: 100 })),
        },
    ],
    viewportWidth: 1200,
};

const press: TabDragEvent = {
    grab: { x: 20, y: 10 },
    kind: 'press',
    origin: { index: 0, row: 'primary' },
    point: { x: 20, y: 10 },
    tabIds: ['a'],
};

function move(x: number, y = 10): TabDragEvent {
    return { draggedWidth: 100, kind: 'move', layout, point: { x, y } };
}

function play(...events: TabDragEvent[]): TabDragStep & { all: TabDragStep['effects'] } {
    let state: TabDragState = idleTabDrag;
    const all: TabDragStep['effects'] = [];
    let last: TabDragStep = { effects: [], state };
    for (const event of events) {
        last = stepTabDrag(state, event);
        state = last.state;
        all.push(...last.effects);
    }
    return { ...last, all };
}

test('a press is not a drag until the pointer travels; a click commits nothing', () => {
    expect(play(press, move(22)).state.phase).toBe('pressed');
    expect(play(press, move(22), { kind: 'release' })).toMatchObject({
        all: [],
        state: { phase: 'idle' },
    });
});

test('an attached drag slides past midpoints and commits its slot on drop', () => {
    const dragging = play(press, move(30), move(160));
    expect(dragging.all).toEqual([{ kind: 'start', tabIds: ['a'] }]);
    // a's left edge at 140, center 190, past b's midpoint (154) but not c's (258).
    expect(dragging.state).toMatchObject({ phase: 'attached', slot: { index: 1 } });
    expect(play(press, move(30), move(160), { kind: 'release' }).effects).toEqual([
        { kind: 'commit', slot: { index: 1, row: 'primary' }, tabIds: ['a'] },
        { kind: 'end', outcome: 'drop' },
        { kind: 'cleanup' },
    ]);
});

test('Escape leaves the rows as they were: nothing was committed', () => {
    expect(play(press, move(30), move(260), { kind: 'cancel' }).effects).toEqual([
        { kind: 'end', outcome: 'cancel' },
        { kind: 'cleanup' },
    ]);
});

test('a multi-selection drags as one block of its width and commits together', () => {
    const group: TabDragEvent = { ...press, tabIds: ['a', 'b'] };
    const wide = (x: number): TabDragEvent => ({
        draggedWidth: 204,
        kind: 'move',
        layout,
        point: { x, y: 10 },
    });
    // The block's left at 230 puts its center (332) past c's midpoint (258).
    const dropped = play(group, wide(30), wide(250), { kind: 'release' });
    expect(dropped.all).toEqual([
        { kind: 'start', tabIds: ['a', 'b'] },
        { kind: 'commit', slot: { index: 1, row: 'primary' }, tabIds: ['a', 'b'] },
        { kind: 'end', outcome: 'drop' },
        { kind: 'cleanup' },
    ]);
});

test('pulling past the threshold detaches; the tab leaves unless its window travels with it', () => {
    const pulled = play(press, move(30), move(30, 70));
    expect(pulled.effects).toEqual([{ kind: 'detach', tabIds: ['a'] }]);
    expect(pulled.state.phase).toBe('detaching');
    expect(
        play(press, move(30), move(30, 70), { keepsTab: false, kind: 'detached' })
    ).toMatchObject({
        effects: [{ kind: 'release-tab', tabIds: ['a'] }],
        state: { phase: 'detached' },
    });
    expect(
        play(press, move(30), move(30, 70), { keepsTab: true, kind: 'detached' }).effects
    ).toEqual([]);
});

test('a release while the detach is in flight ends the drag once Electron answers', () => {
    const early = play(press, move(30), move(30, 70), { kind: 'release' });
    expect(early.effects).toEqual([]);
    expect(stepTabDrag(early.state, { keepsTab: false, kind: 'detached' }).effects).toEqual([
        { kind: 'release-tab', tabIds: ['a'] },
        { kind: 'end', outcome: 'drop' },
        { kind: 'cleanup' },
    ]);
    // Refused: the tab lands where it rode.
    expect(stepTabDrag(early.state, { kind: 'detach-refused' }).effects[0]).toMatchObject({
        kind: 'commit',
    });
});

test('a detached tab can come back onto its own band and keeps its origin for Escape', () => {
    const back = play(
        press,
        move(30),
        move(30, 70),
        { keepsTab: false, kind: 'detached' },
        {
            grab: { x: 20, y: 10 },
            kind: 'attach',
            point: { x: 250, y: 10 },
            slot: { index: 2, row: 'primary' },
            tabIds: ['a'],
        }
    );
    expect(back.state).toMatchObject({ origin: { index: 0 }, owner: 'pointer', phase: 'attached' });
    expect(stepTabDrag(back.state, { kind: 'cancel' }).effects[0]).toMatchObject({
        slot: { index: 0 },
    });
});

test('a relayed tab rides another window, lands on its drop, and never ends the session', () => {
    const relayed = play({
        grab: { x: 20, y: 10 },
        kind: 'attach',
        point: { x: 120, y: 10 },
        slot: { index: 1, row: 'primary' },
        tabIds: ['x'],
    });
    expect(relayed.state).toMatchObject({ owner: 'relay', phase: 'attached' });
    expect(stepTabDrag(relayed.state, { kind: 'release' }).effects).toEqual([
        { kind: 'commit', slot: { index: 1, row: 'primary' }, tabIds: ['x'] },
    ]);
    const out = stepTabDrag(relayed.state, move(120, 90));
    expect(out.effects).toEqual([{ kind: 'detach', tabIds: ['x'] }]);
    expect(stepTabDrag(out.state, { keepsTab: false, kind: 'detached' })).toEqual({
        effects: [{ kind: 'release-tab', tabIds: ['x'] }],
        state: idleTabDrag,
    });
    expect(stepTabDrag(relayed.state, { kind: 'withdrawn' }).effects).toEqual([]);
});

test('a detached drag ends on release or Escape and tears down', () => {
    const detached = play(press, move(30), move(30, 70), { keepsTab: false, kind: 'detached' });
    expect(stepTabDrag(detached.state, { kind: 'cancel' }).effects).toEqual([
        { kind: 'end', outcome: 'cancel' },
        { kind: 'cleanup' },
    ]);
    expect(stepTabDrag(detached.state, { kind: 'withdrawn' }).effects).toEqual([
        { kind: 'cleanup' },
    ]);
});
