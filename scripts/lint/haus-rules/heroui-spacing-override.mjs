import { jsxName } from './jsx-name.mjs';

/**
 * HeroUI components carry their own padding and gap. Cancelling that spacing
 * at a call site is how a component gets neutralized so hand-drawn layout can
 * take its place. Options: `{ allow: { "<path>": "<reason>" } }` names the
 * call sites that host a full-bleed surface; an entry that no longer
 * overrides anything is reported so the list only names real exceptions.
 */
const spacingOwners = new Set([
    'AlertDialog',
    'Card',
    'Drawer',
    'ItemCard',
    'ItemCardGroup',
    'Modal',
    'Sheet',
]);
const cancelledSpacing = /(?<![\w-])(?:gap-0|m-0|p-0|pb-0|pe-0|ps-0|pt-0|px-0|py-0)(?![\w.-])/u;

export const herouiSpacingOverride = {
    meta: {
        type: 'problem',
        schema: [
            {
                type: 'object',
                properties: { allow: { type: 'object', additionalProperties: { type: 'string' } } },
                additionalProperties: false,
            },
        ],
        messages: {
            cancelledSpacing:
                'className cancels a HeroUI component’s own spacing. Compose with the component instead; see docs/internals/react.md.',
            staleAllowance:
                'This file is allowlisted for haus/heroui-spacing-override but no longer overrides HeroUI spacing; remove its entry.',
        },
    },
    create(context) {
        const allow = Object.keys(context.options[0]?.allow ?? {});
        const allowed = allow.some((path) => context.filename.endsWith(`/${path}`));
        let overrides = 0;
        return {
            JSXOpeningElement(node) {
                const owner = jsxName({ openingElement: node })?.split('.')[0];
                if (!spacingOwners.has(owner)) {
                    return;
                }
                const className = classNameText(node);
                if (className === null || !cancelledSpacing.test(className)) {
                    return;
                }
                overrides += 1;
                if (!allowed) {
                    context.report({ messageId: 'cancelledSpacing', node });
                }
            },
            'Program:exit'(node) {
                if (allowed && overrides === 0) {
                    context.report({ messageId: 'staleAllowance', node });
                }
            },
        };
    },
};

function classNameText(opening) {
    const attribute = opening.attributes.find(
        (entry) => entry.type === 'JSXAttribute' && entry.name.name === 'className'
    );
    const value = attribute?.value;
    if (value?.type === 'Literal' && typeof value.value === 'string') {
        return value.value;
    }
    if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'Literal') {
        return typeof value.expression.value === 'string' ? value.expression.value : null;
    }
    return null;
}
