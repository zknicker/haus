import type { UsageOverview, WorkerRuntime, WorkerRuntimeReadiness } from '@haus/api';
import { type DisplayPlanWindow, percentLeft } from '../usage/runtime-plan-windows.ts';
import { buildRuntimeRow, staleUsageTimestamp } from '../usage/runtime-usage-row.ts';

const presetLimits = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20];

export const workersOffKey = 'off';

export function workerLimitChoices(computer: {
    canChangeWorkers: boolean;
    canEnableWorkers: boolean;
    workerLimit: number;
    workersEnabled: boolean;
}) {
    const limits = [...new Set([...presetLimits, computer.workerLimit])].sort((a, b) => a - b);
    const options = [
        { id: workersOffKey, label: 'Off' },
        ...limits.map((limit) => ({ id: String(limit), label: `Up to ${limit}` })),
    ];
    const ceiling = computer.workersEnabled ? computer.workerLimit : 0;
    const disabled = computer.canEnableWorkers
        ? []
        : limits.filter((limit) => limit > ceiling).map(String);
    return {
        disabled,
        isDisabled: !computer.canChangeWorkers,
        options,
        value: computer.workersEnabled ? String(computer.workerLimit) : workersOffKey,
    };
}

export function workersSentence(computer: { workerLimit: number; workersEnabled: boolean }) {
    if (!computer.workersEnabled) {
        return 'Captains can’t start Workers here.';
    }
    const workers = computer.workerLimit === 1 ? '1 Worker' : `${computer.workerLimit} Workers`;
    return `Captains with access can run up to ${workers} here at once.`;
}

export interface WorkerRuntimeView {
    detail: string | null;
    id: WorkerRuntime;
    stale: boolean;
    status: 'missing' | 'not-ready' | 'ready' | 'signed-out';
    week: DisplayPlanWindow | null;
}

export const workerRuntimeTitles: Record<WorkerRuntime, string> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
};

export function workerRuntimeViews(input: {
    detected: ReadonlySet<string>;
    failedSignIns: ReadonlySet<string>;
    now: number;
    readiness: readonly WorkerRuntimeReadiness[];
    usage: UsageOverview | null;
}) {
    return (['claude-code', 'codex'] as const).map((id) => {
        const reading = input.readiness.find((entry) => entry.runtime === id);
        const status: WorkerRuntimeView['status'] = input.failedSignIns.has(id)
            ? 'signed-out'
            : reading?.ready
              ? 'ready'
              : input.detected.has(id) || reading
                ? 'not-ready'
                : 'missing';
        const plan = input.usage ? buildRuntimeRow(id, input.usage) : null;
        const view: WorkerRuntimeView = {
            detail: reading?.detail ?? null,
            id,
            stale: plan ? staleUsageTimestamp(plan, input.now) !== null : false,
            status,
            week: plan?.window ?? null,
        };
        return view;
    });
}

export function planLeftLine(
    runtime: Pick<WorkerRuntimeView, 'stale'> & { week: DisplayPlanWindow }
) {
    const left = `${percentLeft(runtime.week)}% of the week left`;
    return runtime.stale ? `${left} · out of date` : left;
}
