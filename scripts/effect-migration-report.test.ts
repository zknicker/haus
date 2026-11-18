import { describe, expect, test } from 'bun:test';
import {
    analyzeSource,
    countMatches,
    evaluateCeilings,
    evaluateDispositionImports,
    evaluateLifecycleLedger,
    evaluateMigrationExceptions,
    type LifecycleDisposition,
    type RiskName,
} from './effect-migration-report.ts';

describe('Effect migration policy', () => {
    test('recognizes the shared Effect integration package', () => {
        const source = analyzeSource(
            "import { settle } from '@haus/effect'; settle(runtime, program); console.warn('x');"
        );
        expect(source.effect).toBe(true);
        expect(source.effectImportOnly).toBe(0);
        expect(source.effectOwnedConsole).toBe(1);
    });

    test('scans aliases while ignoring comments, strings, and import-only Effect', () => {
        const aliased = analyzeSource(`
            // Effect.runPromise(fake)
            import * as E from 'effect';
            const program: E.Effect<number, unknown, never> = E.succeed(1);
            E.runPromise(program);
            E.tryPromise({ catch: cause => cause, try: async () => 1 });
            console.warn('Effect.runPromise(fake)');
        `);
        expect(aliased.staticRuntime).toBe(1);
        expect(aliased.unknownErrorChannel).toBe(1);
        expect(aliased.foreignFailureIdentityCatch).toBe(1);
        expect(aliased.effectOwnedConsole).toBe(1);
        expect(
            analyzeSource(
                `/* import * as E from 'effect'; E.runPromise(x); */ const x = 'console.warn(';`
            ).effect
        ).toBe(false);
        expect(analyzeSource(`import { Effect } from 'effect';`).effectImportOnly).toBe(1);
    });

    test('finds aliased runtime construction and does not bless it by import shape', () => {
        expect(
            analyzeSource(
                `import { ManagedRuntime as Runtime } from 'effect'; Runtime.make(layer);`
            ).managedRuntimeConstruction
        ).toBe(1);
    });

    test('walks template substitutions and named aliases while ignoring unused namespaces', () => {
        const source = analyzeSource(
            'import { Effect as Fx, runPromise as execute } from "effect";\n' +
                'const program: Fx<number, unknown, never> = Fx.succeed(1);\n' +
                'const rendered = ' +
                String.fromCharCode(96) +
                'result: ' +
                '$' +
                '{execute(program)}' +
                String.fromCharCode(96) +
                ';'
        );
        expect(source.staticRuntime).toBe(1);
        expect(source.unknownErrorChannel).toBe(1);
        expect(analyzeSource('import * as E from "effect";').effectImportOnly).toBe(1);
        expect(analyzeSource('import type { Effect } from "effect";').effectImportOnly).toBe(1);
        expect(analyzeSource('import "effect";').effectImportOnly).toBe(1);
        expect(
            analyzeSource(
                'import type { Effect } from "effect";\n' +
                    'const program: Effect<number, never, never> = undefined as never;'
            ).effectImportOnly
        ).toBe(0);
    });

    test('checks effect-owned disposition against actual imports', () => {
        expect(
            evaluateDispositionImports(
                [
                    { effect: false, path: 'missing-import.ts' },
                    { effect: true, path: 'owned.ts' },
                ],
                {
                    'missing-import.ts': {
                        disposition: 'effect-owned',
                        reason: 'The process owner coordinates this resource across operations.',
                        risks: {
                            abortController: 0,
                            catchAndIgnore: 0,
                            finallyBlock: 0,
                            manualPromise: 0,
                            timer: 0,
                        },
                    },
                    'owned.ts': {
                        disposition: 'effect-owned',
                        reason: 'The process owner coordinates this resource across operations.',
                        risks: {
                            abortController: 0,
                            catchAndIgnore: 0,
                            finallyBlock: 0,
                            manualPromise: 0,
                            timer: 0,
                        },
                    },
                }
            )
        ).toEqual(['missing-import.ts: effect-owned disposition has no Effect/lifecycle import']);
    });

    test('counts static launchers without conflating runtime methods', () => {
        expect(
            countMatches(
                'Effect.runPromise(program); runtime.runPromise(program); Effect.runSync(program)',
                /\bEffect\.run(?:Fork|Promise|PromiseExit|Sync)\s*\(/gu
            )
        ).toBe(2);
    });

    test('rejects new, growing, and stale migration debt', () => {
        expect(
            evaluateCeilings(
                'staticRuntime',
                { 'grown.ts': 3, 'new.ts': 1, 'reduced.ts': 1 },
                { 'gone.ts': 1, 'grown.ts': 2, 'reduced.ts': 2 },
                false
            )
        ).toEqual([
            'gone.ts: lower staticRuntime ceiling from 1 to 0',
            'grown.ts: staticRuntime grew from 2 to 3',
            'new.ts: unreviewed staticRuntime debt (found 1)',
            'reduced.ts: lower staticRuntime ceiling from 2 to 1',
        ]);
    });

    test('completion mode requires zero debt even when policy allows it', () => {
        expect(
            evaluateCeilings('customSettlement', { 'legacy.ts': 1 }, { 'legacy.ts': 1 }, true)
        ).toEqual(['legacy.ts: customSettlement must be zero at migration completion (found 1)']);
    });

    test('requires exact, reasoned exceptions for deliberate foreign failure identity', () => {
        expect(
            evaluateMigrationExceptions(
                'foreignFailureIdentityCatch',
                { 'shutdown.ts': 1 },
                { 'shutdown.ts': 1 },
                { 'shutdown.ts': 'Preserves the first foreign failure identity after finalizers.' }
            )
        ).toEqual([]);
        expect(
            evaluateCeilings(
                'foreignFailureIdentityCatch',
                { 'shutdown.ts': 1 },
                { 'shutdown.ts': 1 },
                true,
                { 'shutdown.ts': 'Preserves the first foreign failure identity after finalizers.' }
            )
        ).toEqual([]);
        expect(
            evaluateMigrationExceptions(
                'foreignFailureIdentityCatch',
                { 'shutdown.ts': 2 },
                { 'shutdown.ts': 1 },
                { 'shutdown.ts': 'Preserves the first foreign failure identity after finalizers.' }
            )
        ).toEqual(['shutdown.ts: foreignFailureIdentityCatch exception changed from 1 to 2']);
    });

    test('requires one exact audited disposition for every lifecycle candidate', () => {
        const ledger = {
            'changed.ts': disposition({ timer: 2 }),
            'stale.ts': disposition({ finallyBlock: 1 }),
        };
        expect(
            evaluateLifecycleLedger(
                [report('changed.ts', { timer: 3 }), report('unreviewed.ts', { manualPromise: 1 })],
                ledger
            )
        ).toEqual([
            'changed.ts: timer risk count changed from 2 to 3',
            'stale.ts: stale lifecycle disposition (file is no longer a candidate)',
            'unreviewed.ts: unreviewed lifecycle candidate',
        ]);
    });

    test('rejects invalid dispositions, vague reasons, and unknown risk fields', () => {
        const invalid = disposition({ finallyBlock: 1 });
        invalid.disposition = 'grandfathered' as LifecycleDisposition['disposition'];
        invalid.reason = 'cleanup';
        (invalid.risks as Record<string, number>).mystery = 1;
        expect(
            evaluateLifecycleLedger([report('invalid.ts', { finallyBlock: 1 })], {
                'invalid.ts': invalid,
            })
        ).toEqual([
            'invalid.ts: invalid lifecycle disposition grandfathered',
            'invalid.ts: lifecycle disposition needs a concrete ownership reason',
            'invalid.ts: unknown lifecycle risk mystery',
        ]);
    });

    test('reports a malformed risk ledger instead of crashing the gate', () => {
        const invalid = disposition({ finallyBlock: 1 });
        invalid.risks = null as unknown as LifecycleDisposition['risks'];
        expect(
            evaluateLifecycleLedger([report('invalid.ts', { finallyBlock: 1 })], {
                'invalid.ts': invalid,
            })
        ).toEqual(['invalid.ts: lifecycle disposition needs exact risk counts']);
    });

    test('reports a malformed disposition instead of crashing the gate', () => {
        expect(
            evaluateLifecycleLedger([report('invalid.ts', { finallyBlock: 1 })], {
                'invalid.ts': 'finite-cleanup' as unknown as LifecycleDisposition,
            })
        ).toEqual(['invalid.ts: lifecycle disposition must be an object']);
    });
});

function disposition(risks: Partial<Record<RiskName, number>>): LifecycleDisposition {
    return {
        disposition: 'finite-cleanup',
        reason: 'A finite operation releases its local resource before returning.',
        risks: completeRisks(risks),
    };
}

function report(path: string, risks: Partial<Record<RiskName, number>>) {
    const complete = completeRisks(risks);
    return {
        path,
        risks: complete,
        score: Object.values(complete).reduce((sum, count) => sum + count, 0),
    };
}

function completeRisks(risks: Partial<Record<RiskName, number>>): Record<RiskName, number> {
    return {
        abortController: risks.abortController ?? 0,
        catchAndIgnore: risks.catchAndIgnore ?? 0,
        finallyBlock: risks.finallyBlock ?? 0,
        manualPromise: risks.manualPromise ?? 0,
        timer: risks.timer ?? 0,
    };
}
