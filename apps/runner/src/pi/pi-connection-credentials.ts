import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import {
    modelOAuthCredentialSchema,
    type RunnerConnectionCredentialFrame,
    type RunnerModelConnection,
} from '@haus/api';
import type { ConnectionBook } from '../model-connections/connection-book.ts';
import type { RunnerLink } from '../run-context.ts';

export function connectionCredentialStore(input: {
    book: ConnectionBook;
    connectionId: string;
    link: RunnerLink;
    providerId: string;
}) {
    const read = (providerId: string) =>
        Promise.resolve(
            providerId === input.providerId
                ? piCredentialOf(input.book.get(input.connectionId))
                : undefined
        );
    const store: CredentialStore = {
        delete: () =>
            Promise.reject(new Error('Model connections are removed in Settings → Models.')),
        async list() {
            const credential = await read(input.providerId);
            return credential ? [{ providerId: input.providerId, type: credential.type }] : [];
        },
        modify: (providerId, change) =>
            input.book.serialize(input.connectionId, async () => {
                const current = await read(providerId);
                const next = await change(current);
                if (next === undefined) {
                    return current;
                }
                if (current?.type !== 'oauth' || next.type !== 'oauth') {
                    throw new Error('Only an OAuth refresh may change a model connection.');
                }
                const { type: _type, ...rotated } = next;
                const credential = modelOAuthCredentialSchema.parse(rotated);
                input.book.refreshed(input.connectionId, credential);
                const frame: RunnerConnectionCredentialFrame = {
                    connectionId: input.connectionId,
                    credential,
                    previousRefresh: current.refresh,
                    type: 'runner-connection-credential',
                };
                input.link.send(frame);
                return next;
            }),
        read,
    };
    return store;
}

function piCredentialOf(connection: RunnerModelConnection | undefined) {
    switch (connection?.credential.kind) {
        case 'oauth': {
            const credential: Credential = { ...connection.credential.credential, type: 'oauth' };
            return credential;
        }
        case 'api-key': {
            const credential: Credential = { key: connection.credential.key, type: 'api_key' };
            return credential;
        }
        default:
            return;
    }
}
