import grandfathered from './grandfathered.json' with { type: 'json' };

export interface Grandfathered {
    complexity: Record<string, number>;
    rules: Record<string, string[]>;
}

/**
 * Oxlint overrides that exempt files which already broke a rule when it was
 * adopted. `bun scripts/lint/grandfather.ts` regenerates the list, which only
 * shrinks. `HAUS_LINT_GRANDFATHER=off` drops the exemptions so the generator
 * can see every current violation.
 */
export function grandfatherOverrides() {
    if (process.env.HAUS_LINT_GRANDFATHER === 'off') {
        return [];
    }
    const list: Grandfathered = grandfathered;
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
