// Traffic capture for the idle network audit (idle-network.mjs): HTTP tRPC procedures,
// same-origin fetches, and App WebSocket lifecycle and frames, reported through `record`.

export function watchNetwork(target, { base, record }) {
    target.on('request', (request) => {
        const url = new URL(request.url());
        if (request.resourceType() === 'websocket' || !url.protocol.startsWith('http')) {
            return;
        }
        // A dev bundle (Electron included) may call the Server port directly.
        if (url.pathname.startsWith('/trpc/')) {
            record('http-batch');
            for (const procedure of url.pathname.slice('/trpc/'.length).split(',')) {
                record('trpc', { procedure: decodeURIComponent(procedure) });
            }
            return;
        }
        if (
            url.origin === new URL(base).origin &&
            ['fetch', 'xhr'].includes(request.resourceType())
        ) {
            record('fetch', { procedure: `GET ${url.pathname}` });
        }
    });
    target.on('websocket', (socket) => {
        if (!new URL(socket.url()).pathname.startsWith('/trpc')) {
            return;
        }
        record('ws-open');
        socket.on('close', () => record('ws-close'));
        socket.on('framesent', ({ payload }) => {
            for (const message of parseFrames(payload)) {
                if (message.method === 'subscription') {
                    record('ws-subscribe', { procedure: message.params?.path });
                } else if (message.method === 'mutation' || message.method === 'query') {
                    record('ws-call', { procedure: message.params?.path });
                }
            }
        });
    });
}

// Runs in the page: keeps every App socket so ws-drop can close them like a network blip.
export function socketRecorder() {
    const sockets = new Set();
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
        constructor(...socketArgs) {
            super(...socketArgs);
            sockets.add(this);
            this.addEventListener('close', () => sockets.delete(this));
        }
    };
    window.__idleDropSockets = () => {
        const open = [...sockets].filter((socket) => new URL(socket.url).pathname === '/trpc');
        for (const socket of open) {
            socket.close();
        }
        return open.length;
    };
}

function parseFrames(payload) {
    if (typeof payload !== 'string' || !(payload.startsWith('{') || payload.startsWith('['))) {
        return [];
    }
    try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}
