/**
 * A Worker Run or Work moves only through `advanceWorkerTurn` and
 * `projectWorker`, so a literal status write anywhere else skips the
 * transition table (specs/worker-turn-lifecycle.md).
 */
const lifecycleTables = new Set(['workerTurnsTable', 'workersTable']);

export const workerStatusWrites = {
    meta: {
        type: 'problem',
        messages: {
            statusWrite:
                'Worker status written outside the Run lifecycle. Go through advanceWorkerTurn and projectWorker. See specs/worker-turn-lifecycle.md.',
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
