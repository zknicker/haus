import * as ts from 'typescript';

export interface Imports {
    effect: boolean;
    effectTypeLocals: Set<string>;
    importedLocals: Set<string>;
    managedLocals: Set<string>;
    namespaceLocals: Set<string>;
    runtimeLocals: Set<string>;
    runtimeRunLocals: Set<string>;
    sideEffectOnly: boolean;
    typeLocals: Set<string>;
}

// oxlint-disable-next-line complexity -- import aliases require explicit conservative cases
export function readImports(file: ts.SourceFile): Imports {
    const imports: Imports = {
        effect: false,
        effectTypeLocals: new Set(),
        importedLocals: new Set(),
        managedLocals: new Set(),
        namespaceLocals: new Set(),
        runtimeLocals: new Set(),
        runtimeRunLocals: new Set(),
        sideEffectOnly: false,
        typeLocals: new Set(),
    };
    for (const statement of file.statements) {
        if (ts.isImportDeclaration(statement)) {
            const module = statement.moduleSpecifier;
            if (!ts.isStringLiteral(module)) {
                continue;
            }
            const source = module.text;
            if (!/^effect(?:\/|$)/u.test(source) && source !== '@haus/effect') {
                continue;
            }
            imports.effect = true;
            const clause = statement.importClause;
            if (!clause) {
                imports.sideEffectOnly = true;
                continue;
            }
            const target = clause.isTypeOnly ? imports.typeLocals : imports.runtimeLocals;
            if (clause.name) {
                target.add(clause.name.text);
                imports.importedLocals.add(clause.name.text);
            }
            const bindings = clause.namedBindings;
            if (!bindings) {
                continue;
            }
            if (ts.isNamespaceImport(bindings)) {
                imports.importedLocals.add(bindings.name.text);
                if (clause.isTypeOnly) {
                    imports.typeLocals.add(bindings.name.text);
                } else {
                    imports.namespaceLocals.add(bindings.name.text);
                }
                continue;
            }
            for (const element of bindings.elements) {
                const local = element.name.text;
                const imported = element.propertyName?.text ?? local;
                const bindingTarget =
                    clause.isTypeOnly || element.isTypeOnly
                        ? imports.typeLocals
                        : imports.runtimeLocals;
                bindingTarget.add(local);
                imports.importedLocals.add(local);
                if (bindingTarget === imports.runtimeLocals && imported === 'ManagedRuntime') {
                    imports.managedLocals.add(local);
                }
                if (imported === 'Effect') {
                    imports.effectTypeLocals.add(local);
                }
                if (
                    bindingTarget === imports.runtimeLocals &&
                    /^run(?:Fork|Promise|PromiseExit|Sync)$/u.test(imported)
                ) {
                    imports.runtimeRunLocals.add(local);
                }
            }
        }
    }
    return imports;
}
