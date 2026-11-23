import { jsxName } from './jsx-name.mjs';

/**
 * A HeroUI compound header or footer lays its own children out. Dropping a
 * layout element straight into one replaces that layout instead of composing
 * with it: Modal.Header stacks Icon over Heading over one muted line, so a
 * flex row inside it strands the icon on its own row. Direct children only;
 * a Body slot is exactly where custom layout belongs.
 *
 * That muted line is a plain `<p>`: the theme styles a header's paragraph
 * (`default-theme.css`, "A dialog's description"), so a class on it restyles
 * the one description every dialog shares.
 */
const compoundSlots = new Set([
    'AlertDialog.Footer',
    'AlertDialog.Header',
    'Drawer.Footer',
    'Drawer.Header',
    'Modal.Footer',
    'Modal.Header',
    'Sheet.Header',
]);
const describedHeaders = new Set(['Drawer.Header', 'Modal.Header', 'Sheet.Header']);
const layoutElements = new Set(['div', 'section', 'span']);

export const herouiCompoundChildren = {
    meta: {
        type: 'problem',
        messages: {
            layoutChild:
                'Layout element as a direct child of a HeroUI compound header/footer. Compose the compound parts instead; custom layout belongs in the Body slot. See docs/internals/react.md.',
            styledDescription:
                "A dialog header's description is a plain <p>; the theme styles it. Drop the className.",
        },
    },
    create(context) {
        return {
            JSXElement(node) {
                const slot = jsxName(node);
                if (!compoundSlots.has(slot)) {
                    return;
                }
                for (const child of node.children) {
                    if (child.type !== 'JSXElement') {
                        continue;
                    }
                    const name = jsxName(child);
                    if (layoutElements.has(name)) {
                        context.report({ messageId: 'layoutChild', node: child });
                    } else if (name === 'p' && describedHeaders.has(slot) && hasClassName(child)) {
                        context.report({ messageId: 'styledDescription', node: child });
                    }
                }
            },
        };
    },
};

function hasClassName(element) {
    return element.openingElement.attributes.some(
        (attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'className'
    );
}
