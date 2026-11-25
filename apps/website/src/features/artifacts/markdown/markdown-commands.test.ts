import { expect, test } from 'bun:test';
import { EditorState, TextSelection } from 'prosemirror-state';
import { splitMarkdownListItem } from './markdown-commands.ts';
import { losslessMarkdownDocument, markdownFileText } from './markdown-round-trip.ts';

function stateAfter(source: string, needle: string) {
    const doc = losslessMarkdownDocument(source);
    if (!doc) {
        throw new Error('fixture is not lossless');
    }
    let position = -1;
    doc.descendants((node, offset) => {
        const index = node.isText ? (node.text ?? '').indexOf(needle) : -1;
        if (index >= 0 && position < 0) {
            position = offset + index + needle.length;
        }
    });
    const state = EditorState.create({ doc });
    return state.apply(state.tr.setSelection(TextSelection.create(doc, position)));
}

function pressEnter(state: EditorState) {
    let next = state;
    const handled = splitMarkdownListItem(state, (tr) => {
        next = state.apply(tr);
    });
    return { handled, state: next };
}

test('Enter at the end of a list item starts the next item', () => {
    const source = '- one\n- two\n';
    const { handled, state } = pressEnter(stateAfter(source, 'one'));
    expect(handled).toBe(true);
    expect(markdownFileText(state.doc, source)).toBe('- one\n-\n- two\n');
});

test('Enter on an empty last item leaves the list for a paragraph', () => {
    const source = '1. one\n';
    const once = pressEnter(stateAfter(source, 'one'));
    expect(markdownFileText(once.state.doc, source)).toBe('1. one\n2.\n');
    const twice = pressEnter(once.state);
    expect(twice.handled).toBe(true);
    expect(twice.state.doc.childCount).toBe(2);
    expect(twice.state.doc.child(0).childCount).toBe(1);
    expect(twice.state.doc.child(1).type.name).toBe('paragraph');
    expect(twice.state.selection.$from.parent.type.name).toBe('paragraph');
});

test('Enter outside a list falls through', () => {
    expect(pressEnter(stateAfter('Plain paragraph\n', 'Plain')).handled).toBe(false);
});
