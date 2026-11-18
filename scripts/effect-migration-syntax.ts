import * as ts from 'typescript';
import { type Imports, readImports } from './effect-migration-imports.ts';

export type RiskName =
    | 'abortController'
    | 'catchAndIgnore'
    | 'finallyBlock'
    | 'manualPromise'
    | 'timer';
export type MigrationName =
    | 'dispositionImportMismatch'
    | 'effectImportOnly'
    | 'effectOwnedConsole'
    | 'foreignFailureIdentityCatch'
    | 'managedRuntimeConstruction'
    | 'unknownErrorChannel';
export interface SourceReport {
    customSettlement: number;
    effect: boolean;
    effectImportOnly: number;
    effectOwnedConsole: number;
    foreignFailureIdentityCatch: number;
    lines: number;
    managedRuntimeConstruction: number;
    path: string;
    risks: Record<RiskName, number>;
    score: number;
    staticRuntime: number;
    unknownErrorChannel: number;
}
export const riskPatterns = {
    abortController: /\bAbortController\b/gu,
    catchAndIgnore: /\.catch\(\(\)\s*=>\s*(?:undefined|\{\})\)/gu,
    finallyBlock: /\bfinally\s*\{/gu,
    manualPromise: /\bnew Promise\b|Promise\.withResolvers/gu,
    timer: /\bset(?:Interval|Timeout)\b/gu,
} as const;
export function countMatches(source: string, pattern: RegExp): number {
    return source.match(pattern)?.length ?? 0;
}
export function analyzeSource(source: string, path = 'fixture.ts'): SourceReport {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = readImports(file);
    const used = new Set<string>();
    let effectOwnedConsole = 0;
    let foreignFailureIdentityCatch = 0;
    let managedRuntimeConstruction = 0;
    let staticRuntime = 0;
    let unknownErrorChannel = 0;
    let customSettlement = 0;
    walk(file, (node) => {
        if (ts.isIdentifier(node)) {
            used.add(node.text);
        }
        if (ts.isCallExpression(node)) {
            if (isConsoleCall(node)) {
                effectOwnedConsole++;
            }
            if (isStaticRuntimeCall(node, imports)) {
                staticRuntime++;
            }
            if (isManagedRuntimeCall(node, imports)) {
                managedRuntimeConstruction++;
            }
            if (isCauseFailureOptionCall(node, imports)) {
                customSettlement++;
            }
        }
        if (ts.isPropertyAssignment(node) && isIdentityCatch(node)) {
            foreignFailureIdentityCatch++;
        }
        if (ts.isTypeReferenceNode(node) && hasUnknownErrorChannel(node, imports)) {
            unknownErrorChannel++;
        }
        if (
            ts.isThrowStatement(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'cause'
        ) {
            customSettlement++;
        }
    });
    const risks = Object.fromEntries(
        Object.entries(riskPatterns).map(([name, pattern]) => [name, countMatches(source, pattern)])
    ) as Record<RiskName, number>;
    const effectImportOnly =
        imports.effect &&
        (imports.sideEffectOnly ||
            (imports.importedLocals.size > 0 &&
                [...imports.importedLocals].every((name) => !used.has(name))))
            ? 1
            : 0;
    return {
        customSettlement,
        effect: imports.effect,
        effectImportOnly,
        effectOwnedConsole: imports.effect ? effectOwnedConsole : 0,
        foreignFailureIdentityCatch,
        lines: source.split('\n').length,
        managedRuntimeConstruction,
        path,
        risks,
        score: Object.values(risks).reduce((sum, count) => sum + count, 0),
        staticRuntime,
        unknownErrorChannel,
    };
}
function walk(file: ts.SourceFile, visit: (node: ts.Node) => void): void {
    const visitNode = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) {
            return;
        }
        visit(node);
        ts.forEachChild(node, visitNode);
    };
    ts.forEachChild(file, visitNode);
}
function isConsoleCall(node: ts.CallExpression): boolean {
    const expression = node.expression;
    return (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === 'console' &&
        ['debug', 'error', 'info', 'log', 'trace', 'warn'].includes(expression.name.text)
    );
}
function isStaticRuntimeCall(node: ts.CallExpression, imports: Imports): boolean {
    const expression = node.expression;
    if (ts.isIdentifier(expression)) {
        return imports.runtimeRunLocals.has(expression.text);
    }
    if (!ts.isPropertyAccessExpression(expression)) {
        return false;
    }
    if (!/^run(?:Fork|Promise|PromiseExit|Sync)$/u.test(expression.name.text)) {
        return false;
    }
    return (
        isEffectReceiver(expression.expression, imports) ||
        (ts.isIdentifier(expression.expression) &&
            imports.runtimeRunLocals.has(expression.expression.text))
    );
}
function isManagedRuntimeCall(node: ts.CallExpression, imports: Imports): boolean {
    const expression = node.expression;
    if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'make') {
        return false;
    }
    const receiver = expression.expression;
    if (ts.isIdentifier(receiver) && imports.managedLocals.has(receiver.text)) {
        return true;
    }
    return (
        ts.isPropertyAccessExpression(receiver) &&
        receiver.name.text === 'ManagedRuntime' &&
        ts.isIdentifier(receiver.expression) &&
        imports.namespaceLocals.has(receiver.expression.text)
    );
}
function isCauseFailureOptionCall(node: ts.CallExpression, imports: Imports): boolean {
    const expression = node.expression;
    return (
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === 'failureOption' &&
        isEffectReceiver(expression.expression, imports)
    );
}
function isEffectReceiver(node: ts.Expression, imports: Imports): boolean {
    if (!ts.isIdentifier(node)) {
        return (
            ts.isPropertyAccessExpression(node) &&
            (node.name.text === 'Effect' || node.name.text === 'Cause') &&
            ts.isIdentifier(node.expression) &&
            imports.namespaceLocals.has(node.expression.text)
        );
    }
    return (
        imports.runtimeLocals.has(node.text) ||
        imports.typeLocals.has(node.text) ||
        imports.namespaceLocals.has(node.text)
    );
}
function isIdentityCatch(node: ts.PropertyAssignment): boolean {
    if (!ts.isIdentifier(node.name) || node.name.text !== 'catch') {
        return false;
    }
    const initializer = ts.skipParentheses(node.initializer);
    if (!ts.isArrowFunction(initializer) || initializer.parameters.length !== 1) {
        return false;
    }
    const parameter = initializer.parameters[0]?.name;
    const body = ts.skipParentheses(initializer.body);
    return ts.isIdentifier(parameter) && ts.isIdentifier(body) && parameter.text === body.text;
}

function hasUnknownErrorChannel(node: ts.TypeReferenceNode, imports: Imports): boolean {
    const argumentsList = node.typeArguments;
    if (!argumentsList || argumentsList.length < 2) {
        return false;
    }
    if (argumentsList[1]?.kind !== ts.SyntaxKind.UnknownKeyword) {
        return false;
    }
    const typeName = node.typeName;
    if (ts.isIdentifier(typeName)) {
        return imports.effectTypeLocals.has(typeName.text);
    }
    return (
        ts.isQualifiedName(typeName) &&
        typeName.right.text === 'Effect' &&
        ts.isIdentifier(typeName.left) &&
        (imports.namespaceLocals.has(typeName.left.text) ||
            imports.runtimeLocals.has(typeName.left.text) ||
            imports.typeLocals.has(typeName.left.text))
    );
}
