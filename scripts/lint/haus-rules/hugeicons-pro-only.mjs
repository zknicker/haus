const freeIconsPackage = '@hugeicons/core-free-icons';

export const hugeiconsProOnly = {
    meta: {
        type: 'problem',
        messages: {
            freeIcons:
                'Import glyphs from @hugeicons-pro/core-stroke-rounded, not @hugeicons/core-free-icons.',
        },
    },
    create(context) {
        const check = (source) => {
            if (source?.value === freeIconsPackage) {
                context.report({ messageId: 'freeIcons', node: source });
            }
        };
        return {
            ExportAllDeclaration: (node) => check(node.source),
            ExportNamedDeclaration: (node) => check(node.source),
            ImportDeclaration: (node) => check(node.source),
            ImportExpression: (node) => check(node.source),
        };
    },
};
