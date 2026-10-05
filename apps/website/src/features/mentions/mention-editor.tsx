import { baseKeymap, splitBlock } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { AllSelection, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isSelectAllShortcut } from '../../lib/select-all.ts';
import { cn } from '../../lib/utils.ts';
import { contentToDoc, mentionSchema } from './mention-document.ts';
import { getActiveMentionQuery } from './mention-text.ts';
import type { ActiveMentionQuery, Mention, MentionKind, MentionOption } from './mention-types.ts';
import { ReferenceChip } from './reference-chip.tsx';

export interface MentionEditorHandle {
    focus: () => void;
    insertMention: (option: MentionOption) => void;
}

export function MentionEditor({
    ariaLabel,
    autoFocus = false,
    className,
    disabled = false,
    id,
    name,
    onActiveQueryChange,
    onChange,
    onFocus,
    onKeyDown,
    placeholder,
    mentions = [],
    ref,
    value,
}: {
    ariaLabel: string;
    autoFocus?: boolean;
    className?: string;
    disabled?: boolean;
    id?: string;
    name: string;
    onActiveQueryChange: (query: ActiveMentionQuery | null) => void;
    onChange: (content: string, mentions: Mention[]) => void;
    onFocus?: () => void;
    onKeyDown: (event: KeyboardEvent) => boolean;
    placeholder?: string;
    mentions?: readonly Mention[];
    ref?: React.Ref<MentionEditorHandle>;
    value: string;
}) {
    const editorRef = React.useRef<HTMLDivElement | null>(null);
    // Latest content: a view rebuilt by a re-run effect (an <Activity> reveal) keeps the draft.
    const contentRef = React.useRef({ mentions, value });
    contentRef.current = { mentions, value };
    const onActiveQueryChangeRef = React.useRef(onActiveQueryChange);
    const onChangeRef = React.useRef(onChange);
    const onFocusRef = React.useRef(onFocus);
    const onKeyDownRef = React.useRef(onKeyDown);
    const viewRef = React.useRef<EditorView | null>(null);
    const valueRef = React.useRef(value);
    const disabledRef = React.useRef(disabled);

    React.useImperativeHandle(
        ref,
        () => ({
            focus() {
                viewRef.current?.focus();
            },
            insertMention(option) {
                insertMentionOption(viewRef.current, option);
            },
        }),
        []
    );

    React.useEffect(() => {
        onActiveQueryChangeRef.current = onActiveQueryChange;
        onChangeRef.current = onChange;
        onFocusRef.current = onFocus;
        onKeyDownRef.current = onKeyDown;
    }, [onActiveQueryChange, onChange, onFocus, onKeyDown]);

    React.useEffect(() => {
        disabledRef.current = disabled;
        viewRef.current?.setProps({
            attributes: mentionEditorAttributes({ ariaLabel, disabled, id }),
            editable: () => !disabledRef.current,
        });
    }, [ariaLabel, disabled, id]);

    React.useEffect(() => {
        const element = editorRef.current;
        if (!element) {
            return;
        }

        let focusFrame: number | null = null;
        const view = new EditorView(element, {
            attributes: mentionEditorAttributes({
                ariaLabel,
                disabled: disabledRef.current,
                id,
            }),
            dispatchTransaction(transaction) {
                const nextState = view.state.apply(transaction);

                view.updateState(nextState);

                const serialized = serializeMentionDoc(nextState.doc);
                valueRef.current = serialized.content;
                onChangeRef.current(serialized.content, serialized.mentions);
                onActiveQueryChangeRef.current(
                    getActiveQuery(nextState.doc, nextState.selection.from)
                );
            },
            editable: () => !disabledRef.current,
            handleDOMEvents: {
                blur: (view) => {
                    onActiveQueryChangeRef.current(
                        getActiveQuery(view.state.doc, view.state.selection.from)
                    );
                    return false;
                },
                focus: (view) => {
                    onFocusRef.current?.();
                    onActiveQueryChangeRef.current(
                        getActiveQuery(view.state.doc, view.state.selection.from)
                    );
                    return false;
                },
                keydown: (view, event) => {
                    if (isSelectAllShortcut(event)) {
                        event.preventDefault();
                        event.stopPropagation();
                        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
                        return true;
                    }

                    if (handleLineBreakKeyDown(view, event)) {
                        return true;
                    }

                    return onKeyDownRef.current(event);
                },
            },
            nodeViews: {
                mention: (node) => new MentionNodeView(node),
            },
            state: EditorState.create({
                doc: contentToDoc(contentRef.current.value, contentRef.current.mentions),
                plugins: [
                    history(),
                    keymap({ Backspace: deleteMentionBeforeCaret }),
                    keymap(baseKeymap),
                ],
                schema: mentionSchema,
            }),
        });

        viewRef.current = view;
        onActiveQueryChangeRef.current(getActiveQuery(view.state.doc, view.state.selection.from));
        if (autoFocus && !disabledRef.current) {
            focusFrame = requestAnimationFrame(() => view.focus());
        }

        return () => {
            if (focusFrame !== null) {
                cancelAnimationFrame(focusFrame);
            }
            view.destroy();
            viewRef.current = null;
        };
    }, [ariaLabel, autoFocus, id]);

    React.useEffect(() => {
        const view = viewRef.current;

        if (!view || value === valueRef.current) {
            return;
        }

        const doc = contentToDoc(value, mentions);
        const transaction = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);

        transaction.setSelection(TextSelection.atEnd(transaction.doc));
        view.dispatch(transaction);
    }, [mentions, value]);

    return (
        <div className={cn('relative', className)}>
            {value.length === 0 && placeholder ? (
                <div className="mention-editor__placeholder pointer-events-none absolute inset-x-3 top-2 truncate text-base text-muted leading-6">
                    {placeholder}
                </div>
            ) : null}
            <input name={name} type="hidden" value={value} />
            <div ref={editorRef} />
        </div>
    );
}

function mentionEditorAttributes({
    ariaLabel,
    disabled,
    id,
}: {
    ariaLabel: string;
    disabled: boolean;
    id?: string;
}) {
    return {
        'aria-disabled': String(disabled),
        'aria-label': ariaLabel,
        class: cn(
            'min-h-0 whitespace-pre-wrap break-words px-3 pt-2 pb-0 text-base leading-6 outline-none',
            disabled && 'pointer-events-none'
        ),
        id: id ?? '',
        role: 'textbox',
    };
}

export function isMentionEditorLineBreakShortcut(
    event: Pick<KeyboardEvent, 'isComposing' | 'key' | 'shiftKey'>
) {
    return event.key === 'Enter' && event.shiftKey && !event.isComposing;
}

class MentionNodeView implements NodeView {
    dom: HTMLElement;
    readonly #root: Root;

    constructor(node: ProseMirrorNode) {
        this.dom = document.createElement('span');
        this.dom.contentEditable = 'false';
        this.#root = createRoot(this.dom);
        this.#render(node);
    }

    destroy() {
        queueMicrotask(() => {
            this.#root.unmount();
        });
    }

    ignoreMutation() {
        return true;
    }

    update(node: ProseMirrorNode) {
        if (node.type.name !== 'mention') {
            return false;
        }

        this.#render(node);
        return true;
    }

    #render(node: ProseMirrorNode) {
        this.#root.render(
            <ReferenceChip
                id={node.attrs.id}
                kind={node.attrs.kind as MentionKind}
                label={node.attrs.label}
                metadata={readMentionMetadata(node.attrs.metadata)}
            />
        );
    }
}

function getActiveQuery(doc: ProseMirrorNode, position: number) {
    const beforeCaret = doc.textBetween(0, position, '\n', '\n');

    return getActiveMentionQuery(beforeCaret, beforeCaret.length);
}

function insertMentionOption(view: EditorView | null, option: MentionOption) {
    if (!view) {
        return;
    }

    const { selection } = view.state;
    const activeQuery = selection.empty ? getActiveQuery(view.state.doc, selection.from) : null;
    const from = activeQuery ? selection.from - optionQueryLength(activeQuery) : selection.from;
    const to = activeQuery ? selection.from : selection.to;
    const mention = mentionSchema.nodes.mention.create({
        id: option.id,
        kind: option.kind,
        label: option.label,
        metadata: option.metadata ?? null,
        projection: option.projection,
        text: option.insertText,
    });
    const before = view.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\n');
    const after = view.state.doc.textBetween(to, to + 1, '\n', '\n');
    const leadingSpace =
        activeQuery || before.length === 0 || /\s$/u.test(before) ? null : mentionSchema.text(' ');
    const trailingSpace = /^\s/u.test(after) ? null : mentionSchema.text(' ');
    const replacement = Fragment.fromArray(
        [leadingSpace, mention, trailingSpace].filter(
            (node): node is ProseMirrorNode => node !== null
        )
    );
    const selectionPosition = from + replacement.size;
    const transaction = view.state.tr.replaceWith(from, to, replacement);

    transaction.setSelection(TextSelection.create(transaction.doc, selectionPosition));

    view.dispatch(transaction);
    view.focus();
}

function handleLineBreakKeyDown(view: EditorView, event: KeyboardEvent) {
    if (!isMentionEditorLineBreakShortcut(event)) {
        return false;
    }

    event.preventDefault();
    return splitBlock(view.state, view.dispatch, view);
}

function optionQueryLength(activeQuery: ActiveMentionQuery) {
    return activeQuery.end - activeQuery.start;
}

function deleteMentionBeforeCaret(state: EditorState, dispatch?: EditorView['dispatch']) {
    if (!state.selection.empty) {
        return false;
    }

    const { $from } = state.selection;
    const parentOffset = $from.parentOffset;
    let childOffset = 0;

    for (let index = 0; index < $from.parent.childCount; index += 1) {
        const node = $from.parent.child(index);
        const nextOffset = childOffset + node.nodeSize;

        if (node.type.name === 'mention' && parentOffset === nextOffset) {
            dispatch?.(
                state.tr
                    .delete($from.start() + childOffset, $from.start() + nextOffset)
                    .scrollIntoView()
            );
            return true;
        }

        if (
            node.isText &&
            node.text === ' ' &&
            parentOffset === nextOffset &&
            index > 0 &&
            $from.parent.child(index - 1).type.name === 'mention'
        ) {
            const mentionStart = childOffset - $from.parent.child(index - 1).nodeSize;

            dispatch?.(
                state.tr
                    .delete($from.start() + mentionStart, $from.start() + nextOffset)
                    .scrollIntoView()
            );
            return true;
        }

        childOffset = nextOffset;
    }

    return false;
}

function serializeMentionDoc(doc: ProseMirrorNode) {
    const mentions: Mention[] = [];
    let content = '';

    for (let index = 0; index < doc.childCount; index += 1) {
        const paragraph = doc.child(index);

        if (index > 0) {
            content += '\n';
        }

        for (let paragraphIndex = 0; paragraphIndex < paragraph.childCount; paragraphIndex += 1) {
            const node = paragraph.child(paragraphIndex);

            if (node.isText) {
                content += node.text ?? '';
                continue;
            }

            if (node.type.name !== 'mention') {
                continue;
            }

            const text = String(node.attrs.text);
            const start = content.length;

            content += text;
            mentions.push({
                end: start + text.length,
                id: node.attrs.id,
                kind: node.attrs.kind,
                label: node.attrs.label,
                metadata: readMentionMetadata(node.attrs.metadata),
                projection: node.attrs.projection,
                start,
                text,
            });
        }
    }

    return { content, mentions };
}

function readMentionMetadata(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
