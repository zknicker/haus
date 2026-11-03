'use strict';

const { randomBytes } = require('node:crypto');
const http = require('node:http');

function createNativeLoopbackCallback(onCallback) {
    let server = null;

    async function prepare() {
        await close();
        const callbackPath = `/sso-callback/${randomBytes(24).toString('hex')}`;
        const nextServer = http.createServer((request, response) => {
            const address = nextServer.address();
            if (!address || typeof address === 'string') {
                respond(response, 500, 'Haus could not complete sign-in.');
                return;
            }

            const origin = `http://127.0.0.1:${address.port}`;
            const requestUrl = new URL(request.url ?? '/', origin);
            if (request.method !== 'GET' || requestUrl.pathname !== callbackPath) {
                respond(response, 404, 'Not found.');
                return;
            }

            respond(response, 200, 'Sign-in complete. Return to Haus; you can close this window.');
            onCallback(requestUrl.toString());
            void close();
        });
        server = nextServer;

        await new Promise((resolve, reject) => {
            nextServer.once('error', reject);
            nextServer.listen(0, '127.0.0.1', () => {
                nextServer.off('error', reject);
                resolve();
            });
        });
        nextServer.unref();

        const address = nextServer.address();
        if (!address || typeof address === 'string') {
            await close();
            throw new Error('Haus could not start its sign-in callback.');
        }
        return `http://127.0.0.1:${address.port}${callbackPath}`;
    }

    async function close() {
        const activeServer = server;
        server = null;
        if (!activeServer?.listening) {
            return;
        }
        await new Promise((resolve) => activeServer.close(resolve));
    }

    return { close, prepare };
}

function respond(response, statusCode, message) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'",
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(message);
}

module.exports = { createNativeLoopbackCallback };
