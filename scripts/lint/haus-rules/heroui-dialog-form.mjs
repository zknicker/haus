import { jsxName } from './jsx-name.mjs';

/**
 * A dialog's Header, Body, and Footer are its own layout children. Wrapping
 * them in a Form collapses that layout and unpins the footer; the Form goes
 * inside the Body slot, with footer buttons submitting it by id.
 */
const dialogFooters = new Set(['AlertDialog.Footer', 'Drawer.Footer', 'Modal.Footer']);

export const herouiDialogForm = {
    meta: {
        type: 'problem',
        messages: {
            formWrapsDialog:
                'Form wraps dialog compound parts. Put the Form inside the Body slot so the header and footer keep the dialog layout. See docs/internals/react.md.',
        },
    },
    create(context) {
        const openForms = [];
        const reported = new Set();
        return {
            JSXElement(node) {
                const name = jsxName(node);
                if (name === 'Form') {
                    openForms.push(node);
                    return;
                }
                if (!dialogFooters.has(name)) {
                    return;
                }
                for (const form of openForms) {
                    if (!reported.has(form)) {
                        reported.add(form);
                        context.report({ messageId: 'formWrapsDialog', node: form });
                    }
                }
            },
            'JSXElement:exit'(node) {
                if (openForms.at(-1) === node) {
                    openForms.pop();
                }
            },
        };
    },
};
