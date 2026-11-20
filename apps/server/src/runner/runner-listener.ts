import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import { runnerSocketPath } from '@haus/api';
import type { FastifyInstance } from 'fastify';

export async function startRunnerListener(
    app: FastifyInstance,
    address: { host: string; port: number }
) {
    const server = createServer((request, response) => {
        if (!servesRunner(request)) {
            response.statusCode = 404;
            response.end();
            return;
        }
        app.routing(request, response);
    });
    server.on('upgrade', (request, socket, head) => {
        if (pathOf(request) !== runnerSocketPath) {
            socket.destroy();
            return;
        }
        app.server.emit('upgrade', request, socket, head);
    });
    server.listen(address.port, address.host);
    await once(server, 'listening');
    const bound = server.address();
    return {
        port: typeof bound === 'object' && bound ? bound.port : address.port,
        async close() {
            server.closeAllConnections();
            server.close();
            await once(server, 'close');
        },
    };
}

function servesRunner(request: IncomingMessage) {
    const path = pathOf(request);
    return path === '/healthz' || path === runnerSocketPath || path.startsWith('/api/agent/');
}

function pathOf(request: IncomingMessage) {
    return new URL(request.url ?? '/', 'http://runner.local').pathname;
}
