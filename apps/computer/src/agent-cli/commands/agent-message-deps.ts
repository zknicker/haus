import { randomUUID } from 'node:crypto';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';

export interface MessageDeps {
    client: AgentApiRequester;
    compositionId?: string;
    mintNonce(): string;
    readStdin(): Promise<string>;
    stdinIsTty: boolean;
    write(text: string): void;
}

export function defaultMessageDeps(): MessageDeps {
    return {
        client: createAgentApiClient(),
        compositionId: process.env.HAUS_COMPOSITION_ID?.trim() || undefined,
        mintNonce: () => `cli-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: Boolean(process.stdin.isTTY),
        write: (text) => process.stdout.write(text),
    };
}
