import {
    type ModelOAuthCredential,
    type ModelProvider,
    modelProviderFor,
    type RunnerModelConnection,
} from '@haus/api';

export type ConnectionBook = ReturnType<typeof createConnectionBook>;

export function createConnectionBook() {
    let connections = new Map<string, RunnerModelConnection>();
    const tails = new Map<string, Promise<unknown>>();
    return {
        get(connectionId: string) {
            return connections.get(connectionId);
        },
        list() {
            return [...connections.values()];
        },
        refreshed(connectionId: string, credential: ModelOAuthCredential) {
            const connection = connections.get(connectionId);
            if (connection) {
                connections.set(connectionId, {
                    ...connection,
                    credential: { credential, kind: 'oauth' },
                });
            }
        },
        replace(snapshot: readonly RunnerModelConnection[]) {
            connections = new Map(snapshot.map((connection) => [connection.id, connection]));
        },
        serialize<T>(connectionId: string, operation: () => Promise<T>) {
            const run = (tails.get(connectionId) ?? Promise.resolve()).then(operation);
            const tail = run.then(
                () => undefined,
                () => undefined
            );
            tails.set(connectionId, tail);
            tail.then(() => {
                if (tails.get(connectionId) === tail) {
                    tails.delete(connectionId);
                }
            });
            return run;
        },
    };
}

export function connectionForRun(
    book: ConnectionBook,
    connectionId: string | null,
    modelId: string
) {
    const connection = connectionId === null ? undefined : book.get(connectionId);
    return connection?.provider === modelProviderFor(modelId) ? connection : null;
}

export function missingConnectionMessage(modelId: string) {
    return `No ${providerNames[modelProviderFor(modelId)]} connection. Connect one in Settings → Models.`;
}

const providerNames: Record<ModelProvider, string> = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    openrouter: 'OpenRouter',
    xai: 'xAI',
};
