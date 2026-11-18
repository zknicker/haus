/**
 * A Cloud Agent Run or Work moves only through `advanceCloudAgentRun` and
 * `projectCloudAgentWork`, so a literal status write anywhere else skips the
 * transition table (specs/cloud-agent-run-lifecycle.md).
 */
const lifecycleTables = new Set(['cloudAgentRunsTable', 'cloudAgentWorkTable']);

export const cloudAgentStatusWrites = {
    meta: {
        type: 'problem',
        messages: {
            statusWrite:
                'Cloud Agent status written outside the Run lifecycle. Go through advanceCloudAgentRun and projectCloudAgentWork. See specs/cloud-agent-run-lifecycle.md.',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                if (!isLifecycleTableSet(node)) {
                    return;
                }
                const [values] = node.arguments;
                if (values?.type !== 'ObjectExpression') {
                    return;
                }
                for (const property of values.properties) {
                    if (property.type === 'Property' && propertyKey(property) === 'status') {
                        context.report({ messageId: 'statusWrite', node: property });
                    }
                }
            },
        };
    },
};

/** `<db>.update(<lifecycle table>).set(...)`. */
function isLifecycleTableSet(node) {
    const { callee } = node;
    if (callee.type !== 'MemberExpression' || propertyName(callee) !== 'set') {
        return false;
    }
    const update = callee.object;
    if (
        update.type !== 'CallExpression' ||
        update.callee.type !== 'MemberExpression' ||
        propertyName(update.callee) !== 'update'
    ) {
        return false;
    }
    const [table] = update.arguments;
    return table?.type === 'Identifier' && lifecycleTables.has(table.name);
}

function propertyName(member) {
    if (!member.computed && member.property.type === 'Identifier') {
        return member.property.name;
    }
    return null;
}

function propertyKey(property) {
    if (property.computed) {
        return null;
    }
    if (property.key.type === 'Identifier') {
        return property.key.name;
    }
    return property.key.type === 'Literal' ? property.key.value : null;
}
