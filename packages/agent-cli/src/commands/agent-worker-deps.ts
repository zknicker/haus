import { randomUUID } from 'node:crypto';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';

/** Shared across every `haus worker` subcommand. */
export interface WorkerDeps {
    client: AgentApiRequester;
    mintNonce(): string;
    readStdin(): Promise<string>;
    stdinIsTty: boolean;
    write(text: string): void;
}

export function defaultDeps(): WorkerDeps {
    return {
        client: createAgentApiClient(),
        mintNonce: () => `worker-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: process.stdin.isTTY === true,
        write: (text) => process.stdout.write(text),
    };
}
