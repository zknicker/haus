import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { type Command, TextSelection } from 'prosemirror-state';
import { markdownSchema } from './markdown-schema.ts';

export function markdownKeymaps() {
    const marks = markdownSchema.marks;
    return [
        keymap({
            'Mod-b': toggleMark(marks.strong),
            'Mod-e': toggleMark(marks.code),
            'Mod-i': toggleMark(marks.em),
            'Mod-y': redo,
            'Mod-z': undo,
            'Shift-Enter': insertHardBreak,
            'Shift-Mod-z': redo,
            Enter: splitMarkdownListItem,
        }),
        keymap(baseKeymap),
    ];
}

const insertHardBreak: Command = (state, dispatch) => {
    if (state.selection.$from.parent.type.spec.code) {
        return false;
    }
    dispatch?.(
        state.tr.replaceSelectionWith(markdownSchema.nodes.hard_break.create()).scrollIntoView()
    );
    return true;
};

export const splitMarkdownListItem: Command = (state, dispatch) => {
    const { $from, $to } = state.selection;
    if ($from.depth < 2 || $from.node(-1).type !== markdownSchema.nodes.list_item) {
        return false;
    }
    if (!$from.sameParent($to) || $from.index(-1) !== 0) {
        return false;
    }
    if ($from.parent.content.size === 0 && $from.node(-1).childCount === 1) {
        return leaveList(state, dispatch);
    }
    const tr = state.tr.deleteSelection();
    dispatch?.(tr.split(tr.mapping.map($from.pos), 2).scrollIntoView());
    return true;
};

const leaveList: Command = (state, dispatch) => {
    const { $from } = state.selection;
    const list = $from.node(-2);
    const itemIndex = $from.index(-2);
    if (itemIndex !== list.childCount - 1) {
        return false;
    }
    const itemStart = $from.before(-1);
    const itemEnd = $from.after(-1);
    const listEnd = $from.after(-2);
    const paragraph = markdownSchema.nodes.paragraph.create();
    const tr = state.tr.insert(listEnd, paragraph);
    if (list.childCount === 1) {
        tr.delete($from.before(-2), listEnd);
    } else {
        tr.delete(itemStart, itemEnd);
    }
    const target = tr.mapping.map(listEnd) - paragraph.nodeSize + 1;
    tr.setSelection(TextSelection.create(tr.doc, Math.max(1, target)));
    dispatch?.(tr.scrollIntoView());
    return true;
};
