import { jsxName } from './jsx-name.mjs';

/**
 * A HeroUI compound header or footer lays its own children out. Dropping a
 * layout element straight into one replaces that layout instead of composing
 * with it: Modal.Header stacks Icon over Heading over one muted line, so a
 * flex row inside it strands the icon on its own row. Direct children only;
 * a Body slot is exactly where custom layout belongs.
 */
const compoundSlots = new Set([
    'AlertDialog.Footer',
    'AlertDialog.Header',
    'Modal.Footer',
    'Modal.Header',
]);
const layoutElements = new Set(['div', 'section', 'span']);

export const herouiCompoundChildren = {
    meta: {
        type: 'problem',
        messages: {
            layoutChild:
                'Layout element as a direct child of a HeroUI compound header/footer. Compose the compound parts instead; custom layout belongs in the Body slot. See docs/internals/react.md.',
        },
    },
    create(context) {
        return {
            JSXElement(node) {
                if (!compoundSlots.has(jsxName(node))) {
                    return;
                }
                for (const child of node.children) {
                    if (child.type === 'JSXElement' && layoutElements.has(jsxName(child))) {
                        context.report({ messageId: 'layoutChild', node: child });
                    }
                }
            },
        };
    },
};
