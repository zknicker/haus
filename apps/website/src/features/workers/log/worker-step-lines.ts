import type { WorkerStep } from '@haus/api';

const verbs = { edit: 'Edited', read: 'Read', run: 'Ran', search: 'Searched' } as const;

export function workerStepLines(steps: readonly WorkerStep[]) {
    const groups: WorkerStep[][] = [];
    for (const step of steps) {
        const last = groups.at(-1);
        if (last?.[0]?.kind === step.kind) {
            last.push(step);
        } else {
            groups.push([step]);
        }
    }
    return groups.map((group) => {
        const kind = group[0]?.kind ?? 'read';
        const runs = group.filter((step) => step.ok !== null);
        return {
            additions: group.reduce((sum, step) => sum + (step.additions ?? 0), 0),
            deletions: group.reduce((sum, step) => sum + (step.deletions ?? 0), 0),
            kind,
            ok: runs.length === 0 ? null : runs.every((step) => step.ok),
            text: `${verbs[kind]} ${group.map((step) => stepName(step)).join(', ')}`,
        };
    });
}

function stepName(step: WorkerStep) {
    return step.kind === 'read' || step.kind === 'edit'
        ? (step.label.split('/').at(-1) ?? step.label)
        : step.label;
}
