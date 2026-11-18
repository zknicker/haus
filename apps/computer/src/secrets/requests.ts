import {
    type ComputerSecretsRequest,
    type ComputerSecretsResult,
    computerSecretsRequestSchema,
    computerSecretsResultSchema,
} from '@haus/api';
import { type EffectRuntime, tracePromise } from '@haus/effect';
import { reportStateError } from '../computer-report.ts';
import { loginKeychain } from './keychain.ts';
import { installSecretsRuntime } from './runtime.ts';
import {
    connectSecrets,
    disconnectSecrets,
    refreshSecretItems,
    type SecretsHost,
} from './store.ts';

/** One Secrets operation at a time per attachment: connect, refresh, and disconnect share files. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Handles a `computer-secrets-request` frame, then re-reports so Server-held
 * Computer state (inventory `secrets`) is what settings read. Returns false
 * for any other frame.
 */
export function handleComputerSecretsRequest(
    frame: unknown,
    input: {
        dataRoot: string;
        refreshReport(): Promise<void>;
        runtime: EffectRuntime<never>;
        send(frame: unknown): boolean;
        serverId: string;
        track<T>(work: Promise<T>): Promise<T>;
    }
): boolean {
    const parsed = computerSecretsRequestSchema.safeParse(frame);
    if (!parsed.success) {
        return false;
    }
    const host = computerSecretsHost(input.dataRoot, input.serverId);
    // Each queued step ends in its own catch, so the chain never rejects.
    const previous = queues.get(input.serverId) ?? Promise.resolve();
    const work = previous
        .then(() => runComputerSecretsRequest(host, parsed.data, input.runtime))
        .then(async (result) => {
            input.send(result);
            await input.refreshReport();
        })
        .catch(reportStateError);
    queues.set(input.serverId, work);
    void input.track(work);
    return true;
}

/** The real host: login Keychain and the pinned Varlock runtime. No `op` CLI. */
export function computerSecretsHost(dataRoot: string, serverId: string): SecretsHost {
    return {
        dataRoot,
        installRuntime: (root) => installSecretsRuntime(root),
        keychain: loginKeychain(),
        serverId,
    };
}

/**
 * The Computer side of Computer settings → Secrets. Only an Owner action in
 * settings reaches this path, never an Agent turn. Errors return one bounded
 * line; the token is never echoed back or logged.
 */
export async function runComputerSecretsRequest(
    host: SecretsHost,
    request: ComputerSecretsRequest,
    runtime: EffectRuntime<never>
): Promise<ComputerSecretsResult> {
    try {
        const result = await tracePromise(
            runtime,
            'haus.computer_secrets.operation',
            {
                'haus.operation': `computer_secrets.${request.operation.kind}`,
                'haus.request.id': request.requestId,
            },
            () => {
                const { operation } = request;
                switch (operation.kind) {
                    case 'connect':
                        return connectSecrets(host, operation);
                    case 'refresh-items':
                        return refreshSecretItems(host, operation);
                    case 'disconnect':
                        return disconnectSecrets(host);
                    default: {
                        const exhaustive: never = operation;
                        return exhaustive;
                    }
                }
            },
            request.traceContext
        );
        return computerSecretsResultSchema.parse({
            requestId: request.requestId,
            result,
            type: 'computer-secrets-result',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'The Secrets request failed.';
        return computerSecretsResultSchema.parse({
            error:
                message
                    .replaceAll(/ops_[A-Za-z0-9+/=_-]+/g, '[token]')
                    .trim()
                    .slice(0, 500) || 'The Secrets request failed.',
            requestId: request.requestId,
            type: 'computer-secrets-result',
        });
    }
}
