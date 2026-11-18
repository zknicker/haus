import grandfathered from './grandfathered.json' with { type: 'json' };

export interface Grandfathered {
    /** File → cyclomatic-complexity ceiling. */
    complexity: Record<string, number>;
    /** Rule → file → violation count, for rules with an `allow` ratchet. */
    allowances: Record<string, Record<string, number>>;
    /** Rule → files exempt from it. */
    rules: Record<string, string[]>;
}

const list: Grandfathered = grandfathered;
const disabled = process.env.HAUS_LINT_GRANDFATHER === 'off';

/**
 * Oxlint overrides that exempt files which already broke a rule when it was
 * adopted. `bun scripts/lint/grandfather.ts` regenerates the list, which only
 * shrinks. `HAUS_LINT_GRANDFATHER=off` drops the exemptions so the generator
 * can see every current violation.
 */
export function grandfatherOverrides() {
    if (disabled) {
        return [];
    }
    const ceilings = new Map<number, string[]>();
    for (const [file, ceiling] of Object.entries(list.complexity)) {
        ceilings.set(ceiling, [...(ceilings.get(ceiling) ?? []), file]);
    }
    return [
        ...Object.entries(list.rules).map(([rule, files]) => ({
            files,
            rules: { [rule]: 'off' as const },
        })),
        ...[...ceilings].map(([ceiling, files]) => ({
            files,
            rules: { complexity: ['error', ceiling] as ['error', number] },
        })),
    ];
}

/** The per-file `allow` counts for a ratcheted rule. */
export function allowances(rule: string) {
    return disabled ? {} : (list.allowances[rule] ?? {});
}
