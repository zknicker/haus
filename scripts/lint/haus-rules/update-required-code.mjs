const serverSource = /(?:^|\/)apps\/server\/src\//u;
const protocolGate = /(?:^|\/)apps\/server\/src\/haus-api\/trpc\.ts$/u;
const testFile = /\.test\.ts$/u;

export const updateRequiredCode = {
    meta: {
        type: 'problem',
        messages: {
            updateRequired:
                "Only the App protocol gate in haus-api/trpc.ts throws PRECONDITION_FAILED, the App's update-required signal. Use another code.",
        },
    },
    create(context) {
        const filename = context.filename.replaceAll('\\', '/');
        if (
            !serverSource.test(filename) ||
            protocolGate.test(filename) ||
            testFile.test(filename)
        ) {
            return {};
        }
        return {
            Literal(node) {
                if (node.value === 'PRECONDITION_FAILED') {
                    context.report({ messageId: 'updateRequired', node });
                }
            },
        };
    },
};
