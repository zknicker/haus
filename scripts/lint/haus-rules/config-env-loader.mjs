const serverConfig = /(?:^|\/)apps\/server\/src\/config\//u;
const fileModules = new Set(['fs', 'node:fs']);

export const configEnvLoader = {
    meta: {
        type: 'problem',
        messages: {
            envLoader:
                'Server config never reads an env file of its own. Varlock is the only loader.',
        },
    },
    create(context) {
        if (!serverConfig.test(context.filename.replaceAll('\\', '/'))) {
            return {};
        }
        return {
            ImportDeclaration(node) {
                const source = node.source.value;
                if (fileModules.has(source) || source.startsWith('dotenv')) {
                    context.report({ messageId: 'envLoader', node: node.source });
                }
            },
        };
    },
};
