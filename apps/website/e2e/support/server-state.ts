import { fileURLToPath } from 'node:url';

/** Where the harness publishes its pid, the Server child's pid, and the restart generation. */
export function serverStateFile(runId = process.env.HAUS_E2E_RUN_ID ?? 'default') {
    return fileURLToPath(new URL(`../../../../.context/e2e/${runId}-server.json`, import.meta.url));
}

export interface ServerState {
    /** Increments each time a restarted Server child is healthy again. */
    databaseUrl: string;
    generation: number;
    harnessPid: number;
    serverPid: number;
}
