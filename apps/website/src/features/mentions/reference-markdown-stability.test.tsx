import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { ReferenceMarkdown } from './reference-markdown.tsx';

let restoreDom: () => void;

/** The first element named `tag` under `node` (the fake DOM has no `querySelector`). */
function find(node: Node, tag: string): Node | null {
    if (node.nodeName.toLowerCase() === tag) {
        return node;
    }
    for (const child of Array.from(node.childNodes)) {
        const found = find(child, tag);
        if (found) {
            return found;
        }
    }
    return null;
}
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

// A press that re-rendered the message (focusing its pane) remounted every element under the
// pointer: the browser dropped the click, so a link in an unfocused pane needed two clicks.
test('re-rendering a message keeps its elements, so a press under the pointer still clicks', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    let root: Root | null = null;
    const render = () =>
        root?.render(
            <ReferenceMarkdown
                content="See [the docs](https://example.com/docs) | **now**."
                onReferenceActivate={() => undefined}
            />
        );
    await act(() => {
        root = createRoot(container);
        render();
    });
    const link = find(container, 'a');
    const paragraph = find(container, 'p');
    expect(link).not.toBeNull();
    await act(() => render());
    expect(find(container, 'a')).toBe(link);
    expect(find(container, 'p')).toBe(paragraph);
    await act(() => root?.unmount());
});
