const computerSource = /(?:^|\/)apps\/computer\//u;
const testFile = /\.test\.tsx?$/u;
const modelSdk =
    /^(?:@anthropic-ai\/sdk|@anthropic-ai\/claude-agent-sdk|openai|ai|@ai-sdk\/[^/]+|@google\/genai|@google\/generative-ai|@mariozechner\/pi-ai|@mariozechner\/pi-agent-core|@earendil-works\/[^/]+)(?:\/.*)?$/u;
const modelHost =
    /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.x\.ai|openrouter\.ai\/api/u;

export const computerNoModelCalls = {
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
            modelSdk:
                'Computer makes no model calls. Model SDKs belong to the runner; see specs/runtime-drivers.md.',
            modelHost:
                'Computer makes no model calls. A model API host belongs to the runner; see specs/runtime-drivers.md.',
            staleAllowance:
                'This file is allowlisted for haus/computer-no-model-calls but no longer calls a model; remove its entry.',
        },
    },
    create(context) {
        const filename = context.filename.replaceAll('\\', '/');
        if (!computerSource.test(filename) || testFile.test(filename)) {
            return {};
        }
        const allow = Object.keys(context.options[0]?.allow ?? {});
        const allowed = allow.some((path) => filename.endsWith(`/${path}`));
        let hits = 0;
        const report = (messageId, node) => {
            hits += 1;
            if (!allowed) {
                context.report({ messageId, node });
            }
        };
        const checkSource = (source) => {
            if (typeof source?.value === 'string' && modelSdk.test(source.value)) {
                report('modelSdk', source);
            }
        };
        return {
            ImportDeclaration: (node) => checkSource(node.source),
            ExportAllDeclaration: (node) => checkSource(node.source),
            ExportNamedDeclaration: (node) => checkSource(node.source),
            ImportExpression: (node) => checkSource(node.source),
            Literal(node) {
                if (typeof node.value === 'string' && modelHost.test(node.value)) {
                    report('modelHost', node);
                }
            },
            TemplateElement(node) {
                if (modelHost.test(node.value.cooked ?? '')) {
                    report('modelHost', node);
                }
            },
            'Program:exit'(node) {
                if (allowed && hits === 0) {
                    context.report({ messageId: 'staleAllowance', node });
                }
            },
        };
    },
};
