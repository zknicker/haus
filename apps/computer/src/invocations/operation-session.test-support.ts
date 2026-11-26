import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessRegistry } from './processes/process-registry.ts';

export function operationSession(agentsRoot = join(tmpdir(), 'haus-operation-session')) {
    return {
        processes: createProcessRegistry({ agentsRoot, limit: 2, send: () => true }),
        runId: 'run_test',
        sessionGeneration: 1,
    };
}
