import { readFile } from 'node:fs/promises';
import {
    analyzeSource,
    type MigrationName,
    type RiskName,
    riskPatterns,
    type SourceReport,
} from './effect-migration-syntax.ts';

export type LifecycleDispositionKind =
    | 'effect-owned'
    | 'external-adapter'
    | 'finite-cleanup'
    | 'test-support';
export type { MigrationName, RiskName };
export { analyzeSource };

export interface LifecycleDisposition {
    disposition: LifecycleDispositionKind;
    reason: string;
    risks: Record<RiskName, number>;
}
export interface EffectMigrationPolicy {
    customSettlementCeilings: Record<string, number>;
    lifecycleCandidates: Record<string, LifecycleDisposition>;
    migrationCeilings: Record<MigrationName, Record<string, number>>;
    migrationExceptions?: Partial<Record<MigrationName, Record<string, string>>>;
    staticRuntimeCeilings: Record<string, number>;
}
type FileReport = SourceReport;
const dispositionKinds = new Set<LifecycleDispositionKind>([
    'effect-owned',
    'external-adapter',
    'finite-cleanup',
    'test-support',
]);

export function countMatches(source: string, pattern: RegExp): number {
    return source.match(pattern)?.length ?? 0;
}

export function evaluateCeilings(
    gate: string,
    actual: Record<string, number>,
    ceilings: Record<string, number>,
    complete: boolean,
    exceptions: Record<string, string> = {}
): string[] {
    const errors: string[] = [];
    for (const path of [...new Set([...Object.keys(actual), ...Object.keys(ceilings)])].sort()) {
        const count = actual[path] ?? 0;
        const ceiling = ceilings[path];
        if (complete && count > 0 && exceptions[path] === undefined) {
            errors.push(`${path}: ${gate} must be zero at migration completion (found ${count})`);
        } else if (ceiling === undefined && count > 0) {
            errors.push(`${path}: unreviewed ${gate} debt (found ${count})`);
        } else if (ceiling !== undefined && count > ceiling) {
            errors.push(`${path}: ${gate} grew from ${ceiling} to ${count}`);
        } else if (ceiling !== undefined && count < ceiling) {
            errors.push(`${path}: lower ${gate} ceiling from ${ceiling} to ${count}`);
        }
    }
    return errors;
}

export function evaluateMigrationExceptions(
    gate: string,
    actual: Record<string, number>,
    ceilings: Record<string, number>,
    exceptions: Record<string, string>
): string[] {
    const errors: string[] = [];
    for (const [path, reason] of Object.entries(exceptions)) {
        if (typeof reason !== 'string' || reason.trim().length < 20) {
            errors.push(`${path}: ${gate} exception needs a concrete reason`);
        }
        if (ceilings[path] === undefined) {
            errors.push(`${path}: ${gate} exception has no exact ceiling`);
        } else if ((actual[path] ?? 0) !== ceilings[path]) {
            errors.push(
                path +
                    ': ' +
                    gate +
                    ' exception changed from ' +
                    ceilings[path] +
                    ' to ' +
                    (actual[path] ?? 0)
            );
        }
    }
    return errors;
}

export function evaluateLifecycleLedger(
    reports: readonly Pick<FileReport, 'path' | 'risks' | 'score'>[],
    ledger: Record<string, LifecycleDisposition>
): string[] {
    const candidates = new Map(
        reports.filter((report) => report.score > 0).map((report) => [report.path, report])
    );
    const errors: string[] = [];
    for (const path of [...new Set([...candidates.keys(), ...Object.keys(ledger)])].sort()) {
        const report = candidates.get(path);
        const disposition = ledger[path];
        if (!report) {
            errors.push(`${path}: stale lifecycle disposition (file is no longer a candidate)`);
        } else if (!disposition) {
            errors.push(`${path}: unreviewed lifecycle candidate`);
        } else if (typeof disposition !== 'object' || Array.isArray(disposition)) {
            errors.push(`${path}: lifecycle disposition must be an object`);
        } else {
            errors.push(...evaluateLifecycleDisposition(path, report.risks, disposition));
        }
    }
    return errors;
}

export function evaluateDispositionImports(
    reports: readonly Pick<FileReport, 'effect' | 'path'>[],
    ledger: Record<string, LifecycleDisposition>
): string[] {
    return reports
        .filter((report) => ledger[report.path]?.disposition === 'effect-owned' && !report.effect)
        .map((report) => `${report.path}: effect-owned disposition has no Effect/lifecycle import`);
}

function evaluateLifecycleDisposition(
    path: string,
    actualRisks: Record<RiskName, number>,
    disposition: LifecycleDisposition
): string[] {
    const errors: string[] = [];
    if (!dispositionKinds.has(disposition.disposition)) {
        errors.push(`${path}: invalid lifecycle disposition ${String(disposition.disposition)}`);
    }
    if (typeof disposition.reason !== 'string' || disposition.reason.trim().length < 20) {
        errors.push(`${path}: lifecycle disposition needs a concrete ownership reason`);
    }
    if (
        !disposition.risks ||
        typeof disposition.risks !== 'object' ||
        Array.isArray(disposition.risks)
    ) {
        return [...errors, `${path}: lifecycle disposition needs exact risk counts`];
    }
    for (const risk of Object.keys(riskPatterns) as RiskName[]) {
        if (disposition.risks[risk] !== actualRisks[risk]) {
            errors.push(
                `${path}: ${risk} risk count changed from ${String(disposition.risks[risk])} to ${actualRisks[risk]}`
            );
        }
    }
    for (const risk of Object.keys(disposition.risks)) {
        if (!(risk in riskPatterns)) {
            errors.push(`${path}: unknown lifecycle risk ${risk}`);
        }
    }
    return errors;
}

async function scanSources() {
    const gates: Record<string, Record<string, number>> = {
        customSettlement: {},
        staticRuntime: {},
    };
    const reports: FileReport[] = [];
    for (const root of ['apps/computer/src', 'apps/server/src']) {
        const glob = new Bun.Glob('**/*.ts');
        for await (const relativePath of glob.scan({ cwd: root })) {
            if (relativePath.endsWith('.test.ts')) {
                continue;
            }
            const path = `${root}/${relativePath}`;
            const report = analyzeSource(await readFile(path, 'utf8'), path);
            reports.push(report);
            for (const gate of ['customSettlement', 'staticRuntime'] as const) {
                const count = report[gate];
                if (count > 0) {
                    gates[gate][path] = count;
                }
            }
        }
    }
    return { gates, reports };
}

async function main() {
    const { gates, reports } = await scanSources();
    const policy = (await Bun.file(
        'scripts/effect-lifecycle-policy.json'
    ).json()) as EffectMigrationPolicy;
    const full = process.argv.includes('--full-complete');
    const roots = new Set([
        'apps/server/src/server-runtime.ts',
        'apps/computer/src/daemon-runtime.ts',
    ]);
    const managedRuntimeConstruction = countsByPath(reports, 'managedRuntimeConstruction');
    for (const root of roots) {
        delete managedRuntimeConstruction[root];
    }
    const actual: Record<MigrationName, Record<string, number>> = {
        dispositionImportMismatch: Object.fromEntries(
            evaluateDispositionImports(reports, policy.lifecycleCandidates).map((error) => [
                error.split(':')[0],
                1,
            ])
        ),
        effectImportOnly: countsByPath(reports, 'effectImportOnly'),
        effectOwnedConsole: countsByPath(reports, 'effectOwnedConsole'),
        foreignFailureIdentityCatch: countsByPath(reports, 'foreignFailureIdentityCatch'),
        managedRuntimeConstruction,
        unknownErrorChannel: countsByPath(reports, 'unknownErrorChannel'),
    };
    console.log(`Production TypeScript files: ${reports.length}`);
    console.log(`Effect-owned files: ${reports.filter((report) => report.effect).length}`);
    console.log(
        `Effect-owned lines: ${reports.filter((report) => report.effect).reduce((sum, report) => sum + report.lines, 0)}`
    );
    console.log(`Lifecycle candidates: ${reports.filter((report) => report.score > 0).length}`);
    console.log(`Static runtime launchers: ${sumCounts(gates.staticRuntime)}`);
    console.log(`Custom settlement matches: ${sumCounts(gates.customSettlement)}`);
    for (const [name, values] of Object.entries(actual)) {
        console.log(`${name}: ${sumCounts(values)}`);
    }
    if (process.argv.includes('--check') || process.argv.includes('--complete') || full) {
        const errors = [
            ...evaluateLifecycleLedger(reports, policy.lifecycleCandidates),
            ...evaluateCeilings(
                'staticRuntime',
                gates.staticRuntime,
                policy.staticRuntimeCeilings,
                process.argv.includes('--complete') || full
            ),
            ...evaluateCeilings(
                'customSettlement',
                gates.customSettlement,
                policy.customSettlementCeilings,
                process.argv.includes('--complete') || full
            ),
            ...Object.entries(actual).flatMap(([name, values]) =>
                (() => {
                    const migrationName = name as MigrationName;
                    const ceilings = policy.migrationCeilings[migrationName];
                    const exceptions = policy.migrationExceptions?.[migrationName] ?? {};
                    return [
                        ...evaluateMigrationExceptions(name, values, ceilings, exceptions),
                        ...evaluateCeilings(name, values, ceilings, full, exceptions),
                    ];
                })()
            ),
        ];
        if (errors.length > 0) {
            console.error(
                `\nEffect lifecycle policy failed:\n${errors.map((error) => `- ${error}`).join('\n')}`
            );
            process.exitCode = 1;
        }
    }
}
function countsByPath(
    reports: readonly FileReport[],
    key: keyof Pick<
        FileReport,
        | 'effectImportOnly'
        | 'effectOwnedConsole'
        | 'foreignFailureIdentityCatch'
        | 'unknownErrorChannel'
    >
): Record<string, number> {
    return Object.fromEntries(
        reports.filter((report) => report[key] > 0).map((report) => [report.path, report[key]])
    );
}
function sumCounts(counts: Record<string, number>): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
if (import.meta.main) {
    await main();
}
