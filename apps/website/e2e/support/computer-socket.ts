import { computerProtocolVersion } from '@haus/api';

/**
 * Just enough of a socket for these fixtures. Specs reach for the global
 * `WebSocket` and for `ws`, and both satisfy this.
 */
export interface AttachmentSocket {
    addEventListener: (
        type: string,
        listener: (event: { data: unknown }) => void,
        options?: { once?: boolean }
    ) => void;
    send: (data: string) => void;
}

/**
 * The Computer attachment socket as a fixture drives it. Specs that need a
 * Computer to say something — an update phase, a Worker observation —
 * bootstrap through here so they all speak the current protocol.
 */
export function socketOpen(socket: AttachmentSocket) {
    return new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('Computer socket failed.')), {
            once: true,
        });
    });
}

export function socketMessage(socket: AttachmentSocket) {
    return new Promise<unknown>((resolve) => {
        socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}

/** The bootstrap answer, past the session fences a Server sends a Computer first. */
export function bootstrapAnswer(socket: AttachmentSocket) {
    return new Promise<unknown>((resolve) => {
        socket.addEventListener('message', (event) => {
            const frame = JSON.parse(String(event.data)) as { mode?: unknown };
            if (frame.mode !== undefined) {
                resolve(frame);
            }
        });
    });
}

/**
 * `idle` bootstraps a Computer that still needs an update, so Server answers
 * `update-required` and refuses its ordinary frames; `complete` bootstraps one
 * on the current protocol, which is what every ordinary frame requires.
 */
export function sendBootstrap(
    socket: AttachmentSocket,
    credential: string,
    phase: 'complete' | 'idle'
) {
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: 1,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: phase === 'complete' ? '1.1.0' : '1.0.0',
            protocolVersion: phase === 'complete' ? computerProtocolVersion : 999,
            type: 'bootstrap',
            update: {
                activeAgentCount: null,
                detail: phase === 'complete' ? 'Haus Computer updated successfully.' : null,
                downloadedBytes: null,
                failedPhase: null,
                phase,
                targetVersion: phase === 'complete' ? '1.1.0' : null,
                totalBytes: null,
                updatedAt: new Date().toISOString(),
            },
        })
    );
}
