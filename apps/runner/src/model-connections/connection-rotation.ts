import type {
    ModelOAuthCredential,
    RunnerConnectionCredentialAckFrame,
    RunnerConnectionCredentialFrame,
    RunnerModelConnection,
} from '@haus/api';

export interface Rotation {
    readonly baseVersion: number;
    readonly latest: ModelOAuthCredential;
    readonly previousRefresh: string;
    readonly rotationId: string;
    readonly sent: ModelOAuthCredential;
}

export type LocalCredential =
    | { readonly kind: 'server' }
    | { readonly kind: 'rotating'; readonly rotation: Rotation }
    | {
          readonly credential: ModelOAuthCredential;
          readonly kind: 'adopting';
          readonly version: number;
      };

export interface BookEntry {
    readonly listed: boolean;
    readonly local: LocalCredential;
    readonly server: RunnerModelConnection;
}

export function viewOf(entry: BookEntry) {
    const credential = readCredential(entry.local);
    const view: RunnerModelConnection = credential
        ? { ...entry.server, credential: { credential, kind: 'oauth' } }
        : entry.server;
    return view;
}

export function applySnapshot(entry: BookEntry | undefined, next: RunnerModelConnection) {
    if (!entry) {
        const fresh: BookEntry = { listed: true, local: { kind: 'server' }, server: next };
        return fresh;
    }
    const server =
        next.credentialVersion >= entry.server.credentialVersion
            ? next
            : {
                  ...next,
                  credential: entry.server.credential,
                  credentialVersion: entry.server.credentialVersion,
              };
    return settleAdoption({ listed: true, local: entry.local, server });
}

export function startRotation(
    entry: BookEntry,
    from: ModelOAuthCredential,
    credential: ModelOAuthCredential
) {
    if (entry.local.kind === 'rotating') {
        const local: LocalCredential = {
            kind: 'rotating',
            rotation: { ...entry.local.rotation, latest: credential },
        };
        return { entry: { ...entry, local }, send: null };
    }
    const rotation: Rotation = {
        baseVersion:
            entry.local.kind === 'adopting' ? entry.local.version : entry.server.credentialVersion,
        latest: credential,
        previousRefresh: from.refresh,
        rotationId: crypto.randomUUID(),
        sent: credential,
    };
    return { entry: { ...entry, local: { kind: 'rotating', rotation } as const }, send: rotation };
}

export function acknowledge(entry: BookEntry, ack: RunnerConnectionCredentialAckFrame) {
    const { local } = entry;
    if (local.kind !== 'rotating' || local.rotation.rotationId !== ack.rotationId) {
        return null;
    }
    const { rotation } = local;
    switch (ack.result) {
        case 'failed':
            return { entry, send: null };
        case 'superseded': {
            const adopted: LocalCredential =
                entry.server.credentialVersion >= ack.credentialVersion
                    ? { kind: 'server' }
                    : {
                          credential: rotation.latest,
                          kind: 'adopting',
                          version: ack.credentialVersion,
                      };
            return { entry: { ...entry, local: adopted }, send: null };
        }
        case 'stored': {
            const server: RunnerModelConnection = {
                ...entry.server,
                credential: { credential: rotation.sent, kind: 'oauth' },
                credentialVersion: ack.credentialVersion,
            };
            if (rotation.latest === rotation.sent) {
                return {
                    entry: { ...entry, local: { kind: 'server' } as const, server },
                    send: null,
                };
            }
            const next: Rotation = {
                baseVersion: ack.credentialVersion,
                latest: rotation.latest,
                previousRefresh: rotation.sent.refresh,
                rotationId: crypto.randomUUID(),
                sent: rotation.latest,
            };
            return {
                entry: { ...entry, local: { kind: 'rotating', rotation: next } as const, server },
                send: next,
            };
        }
        default:
            return ack.result satisfies never;
    }
}

export function rotationFrame(connectionId: string, rotation: Rotation) {
    const frame: RunnerConnectionCredentialFrame = {
        baseVersion: rotation.baseVersion,
        connectionId,
        credential: rotation.sent,
        previousRefresh: rotation.previousRefresh,
        rotationId: rotation.rotationId,
        type: 'runner-connection-credential',
    };
    return frame;
}

function settleAdoption(entry: BookEntry) {
    const { local } = entry;
    return local.kind === 'adopting' && entry.server.credentialVersion >= local.version
        ? { ...entry, local: { kind: 'server' } as const }
        : entry;
}

function readCredential(local: LocalCredential) {
    switch (local.kind) {
        case 'rotating':
            return local.rotation.latest;
        case 'adopting':
            return local.credential;
        default:
            return null;
    }
}
