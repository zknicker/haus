import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';

export function computerSocketFixture(serverUrl: () => string, credential: string) {
    return { attachComputer, bootstrapFrame, computerSocketUrl, opened };

    async function attachComputer() {
        const socket = new WebSocket(computerSocketUrl());
        await opened(socket);
        socket.send(JSON.stringify(bootstrapFrame()));
        await new Promise<void>((resolve) => {
            socket.addEventListener(
                'message',
                (event) => {
                    if (JSON.parse(String(event.data)).type === 'bootstrap-accepted') {
                        resolve();
                    }
                },
                { once: true }
            );
        });
        return socket;
    }

    function bootstrapFrame() {
        return {
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.1.2',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: 'Haus Computer updated successfully.',
                phase: 'complete',
                targetVersion: '1.1.2',
                updatedAt: '2026-07-29T16:53:27.328Z',
            },
        };
    }

    function computerSocketUrl() {
        const url = new URL('/computer/attachment', serverUrl());
        url.protocol = 'ws:';
        return url;
    }

    function opened(socket: WebSocket) {
        return new Promise<void>((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true });
            socket.addEventListener('error', () => reject(new Error('socket failed')), {
                once: true,
            });
        });
    }
}
