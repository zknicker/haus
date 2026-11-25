import { history } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { markdownKeymaps } from './markdown-commands.ts';

export function useMarkdownEditor({
    ariaLabel,
    autoFocus = false,
    editable,
    initial,
    onChange,
}: {
    ariaLabel: string;
    autoFocus?: boolean;
    editable: boolean;
    initial: ProseMirrorNode;
    onChange: (doc: ProseMirrorNode) => void;
}) {
    const mountRef = React.useRef<HTMLDivElement | null>(null);
    const viewRef = React.useRef<EditorView | null>(null);
    const initialRef = React.useRef(initial);
    const onChangeRef = React.useRef(onChange);
    const editableRef = React.useRef(editable);
    const attributesRef = React.useRef(editorAttributes(ariaLabel, editable));
    const autoFocusRef = React.useRef(autoFocus);

    React.useEffect(() => {
        onChangeRef.current = onChange;
        editableRef.current = editable;
        viewRef.current?.setProps({ attributes: editorAttributes(ariaLabel, editable) });
    }, [ariaLabel, editable, onChange]);

    React.useEffect(() => {
        const mount = mountRef.current;
        if (!mount) {
            return;
        }
        const view = new EditorView(mount, {
            attributes: attributesRef.current,
            dispatchTransaction(transaction) {
                view.updateState(view.state.apply(transaction));
                if (transaction.docChanged) {
                    onChangeRef.current(view.state.doc);
                }
            },
            editable: () => editableRef.current,
            handleDOMEvents: {
                keydown: (target, event) => {
                    if (event.key !== 'Escape') {
                        return false;
                    }
                    (target.dom as HTMLElement).blur();
                    return true;
                },
            },
            state: EditorState.create({
                doc: initialRef.current,
                plugins: [history(), ...markdownKeymaps()],
            }),
        });
        viewRef.current = view;
        if (autoFocusRef.current) {
            view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
            view.focus();
        }
        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    return mountRef;
}

function editorAttributes(ariaLabel: string, editable: boolean) {
    return {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        'aria-readonly': String(!editable),
        class: 'artifact-document__prose',
        role: 'textbox',
        spellcheck: 'true',
    };
}
