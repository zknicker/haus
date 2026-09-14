import {
    type ComputerInventoryRefreshResult,
    computerInventoryRefreshRequestSchema,
} from '@haus/api';
import { reportStateError } from './computer-report.ts';
import { detectInventory } from './inventory.ts';

export function handleInventoryRefresh(
    frame: unknown,
    input: {
        send(frame: unknown): boolean;
        track<T>(work: Promise<T>): Promise<T>;
        refreshUsage(): Promise<void>;
    }
): boolean {
    const request = computerInventoryRefreshRequestSchema.safeParse(frame);
    if (!request.success) {
        return false;
    }
    void input.track(refreshRuntimeInventory(request.data.requestId).then(input.send));
    if (process.env.HAUS_COMPUTER_USAGE_DISABLED !== '1') {
        void input.track(input.refreshUsage().catch(reportStateError));
    }
    return true;
}

export function refreshRuntimeInventory(
    requestId: string,
    options: Parameters<typeof detectInventory>[0] = {}
): Promise<ComputerInventoryRefreshResult> {
    try {
        return Promise.resolve({
            requestId,
            runtimes: detectInventory(options).runtimes,
            status: 'refreshed',
            type: 'inventory-refresh-result',
        });
    } catch {
        return Promise.resolve({
            error: 'Could not scan installed runtimes on this Computer.',
            requestId,
            status: 'failed',
            type: 'inventory-refresh-result',
        });
    }
}
