import type { ComputerUsage } from '@haus/api';
import { computerLabel } from '../../../computers/presentation.ts';
import { buildRuntimeRow, runtimeLabels, runtimeOrder } from '../../../usage/runtime-usage-row.ts';
import type { ModelsComputer } from '../model-catalog.ts';
import type { AccountRow } from './connections-table-model.ts';

export function deviceRows(
    computers: readonly ModelsComputer[],
    usage: readonly Pick<ComputerUsage, 'computerId' | 'usage'>[]
) {
    return computers.flatMap((computer) => {
        const inventory = computer.reportedInventory;
        const report = usage.find((item) => item.computerId === computer.id)?.usage ?? null;
        const device = computerLabel(computer);
        return runtimeOrder
            .filter((id) => inventory?.runtimes.some((runtime) => runtime.id === id))
            .map((runtimeId) => {
                const signedOut = Boolean(
                    inventory?.runtimeIssues?.some((issue) => issue.runtimeId === runtimeId)
                );
                const usageRow = report ? buildRuntimeRow(runtimeId, report) : null;
                const row: AccountRow = {
                    fiveHour: usageRow?.fiveHourWindow ?? null,
                    id: `${computer.id}:${runtimeId}`,
                    kind: 'device',
                    mark: runtimeId,
                    problem: deviceProblem(signedOut, Boolean(usageRow?.issue)),
                    subtitle: device,
                    title: runtimeLabels[runtimeId],
                    weekly: usageRow?.window ?? null,
                };
                return row;
            });
    });
}

function deviceProblem(signedOut: boolean, usageFailed: boolean) {
    if (signedOut) {
        return 'Sign-in failed';
    }
    return usageFailed ? 'Usage unavailable' : null;
}
