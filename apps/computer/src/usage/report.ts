import { createComputerUsageCache } from './computer-usage-cache.ts';
import { readOpenRouterManagementKey } from './openrouter-settings.ts';

export function createUsageReporter(dataRoot: string) {
    const read = createComputerUsageCache({ dataRoot });
    return async (send: (frame: unknown) => boolean, mode: 'cached' | 'refresh' = 'cached') => {
        const usage = await read(
            {
                openRouterManagementKey: await readOpenRouterManagementKey(dataRoot),
            },
            mode
        );
        send({ type: 'usage-report', usage });
    };
}
