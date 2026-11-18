import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { call, journal } from './turn-trace-test-fixtures.ts';
import { buildTurnTraceView } from './turn-trace-view.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
    // React Aria's press cleanup checks `instanceof SVGElement`; the fake DOM has none.
    (globalThis as Record<string, unknown>).SVGElement = class {};
});
afterAll(() => {
    Reflect.deleteProperty(globalThis, 'SVGElement');
    restoreDom();
});

const reads = [
    call('read-1', 'read', ['00:01.000', '00:01.200'], { path: 'a.ts' }),
    call('read-2', 'read', ['00:01.300', '00:01.500'], { path: 'b.ts' }),
];

// A live turn re-derives its steps on every append. A call that joins an open
// fold row, even one the Agent captioned with a thought, must not remount the
// row: a remount forgets that someone opened it.
test('a call appended to a fold keeps the fold row, and its open state, mounted', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    let root: Root | null = null;
    const render = (tools: Parameters<typeof journal>[2], reasoning = false) => {
        const view = buildTurnTraceView(
            journal('run-fold', ['00:00.000'], tools, {
                status: 'running',
                ...(reasoning
                    ? {
                          reasoning: [
                              {
                                  id: 'r',
                                  startedAt: '2026-10-06T17:00:01.550Z',
                                  text: '**Checking the last file**',
                              },
                          ],
                      }
                    : {}),
            }),
            [],
            Date.parse('2026-10-06T17:00:05.000Z')
        );
        root?.render(<TurnTraceSteps steps={view.steps} />);
    };

    await act(() => {
        root = createRoot(container);
        render(reads.slice(0, 1));
    });
    const anchor = find(container, (node) => readAttribute(node, 'data-trace-anchor') !== null);
    expect(anchor).not.toBeNull();

    // The lone call becomes a fold in place: the row does not leave and re-enter.
    await act(() => render(reads));
    expect(find(container, (node) => readAttribute(node, 'data-trace-anchor') !== null)).toBe(
        anchor
    );
    const trigger = find(container, (node) => readAttribute(node, 'data-slot') === 'disclosure');
    expect(trigger).not.toBeNull();

    await act(() =>
        render(
            [...reads, call('read-3', 'read', ['00:01.600', '00:01.800'], { path: 'c.ts' })],
            true
        )
    );
    expect(container.textContent).toContain('Checking the last file');
    expect(find(container, (node) => readAttribute(node, 'data-slot') === 'disclosure')).toBe(
        trigger
    );
    await act(() => root?.unmount());
});

function readAttribute(node: Node, name: string): string | null {
    return 'getAttribute' in node ? (node as Element).getAttribute(name) : null;
}

/** The first node under `node` that `match` accepts (the fake DOM has no `querySelector`). */
function find(node: Node, match: (node: Node) => boolean): Node | null {
    if (match(node)) {
        return node;
    }
    for (const child of Array.from(node.childNodes)) {
        const found = find(child, match);
        if (found) {
            return found;
        }
    }
    return null;
}
