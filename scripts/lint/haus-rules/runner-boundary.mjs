import { posix } from 'node:path';

const runnerSource = /(?:^|\/)apps\/runner\//u;
const serverPath = /(?:^|\/)apps\/server(?:\/|$)/u;
const serverPackage = /^@haus\/server(?:\/|$)/u;
const databaseClient =
    /^(?:postgres|pg|pg-[^/]+|drizzle-orm|@neondatabase\/[^/]+|bun:sql)(?:\/.*)?$/u;
const sqlNames = new Set(['sql', 'SQL']);

export const runnerBoundary = {
    meta: {
        type: 'problem',
        messages: {
            serverImport:
                'The runner reaches Haus only through its scoped API. It never imports Server code or config.',
            databaseClient:
                'The runner reaches Haus only through its scoped API. It never holds a PostgreSQL client.',
            bunSql: 'The runner reaches Haus only through its scoped API. It never opens Bun.sql.',
        },
    },
    create(context) {
        const filename = context.filename.replaceAll('\\', '/');
        if (!runnerSource.test(filename)) {
            return {};
        }
        const directory = posix.dirname(filename);
        const bunNames = new Set(['Bun']);
        const checkBunImport = (node) => {
            if (node.source.value !== 'bun') {
                return;
            }
            for (const specifier of node.specifiers) {
                if (specifier.type !== 'ImportSpecifier') {
                    bunNames.add(specifier.local.name);
                } else if (sqlNames.has(specifier.imported.name ?? specifier.imported.value)) {
                    context.report({ messageId: 'bunSql', node: specifier });
                }
            }
        };
        const check = (source) => {
            if (!source || typeof source.value !== 'string') {
                return;
            }
            const value = source.value;
            const resolved = value.startsWith('.') ? posix.resolve(directory, value) : value;
            if (serverPath.test(resolved) || serverPackage.test(value)) {
                context.report({ messageId: 'serverImport', node: source });
            } else if (databaseClient.test(value)) {
                context.report({ messageId: 'databaseClient', node: source });
            }
        };
        return {
            ImportDeclaration(node) {
                check(node.source);
                checkBunImport(node);
            },
            ExportAllDeclaration: (node) => check(node.source),
            ExportNamedDeclaration: (node) => check(node.source),
            ImportExpression: (node) => check(node.source),
            CallExpression(node) {
                if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                    check(node.arguments[0]);
                }
            },
            MemberExpression(node) {
                const name = node.property.name ?? node.property.value;
                if (
                    node.object.type === 'Identifier' &&
                    bunNames.has(node.object.name) &&
                    sqlNames.has(name)
                ) {
                    context.report({ messageId: 'bunSql', node });
                }
            },
        };
    },
};
