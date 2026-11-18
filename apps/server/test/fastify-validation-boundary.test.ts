import { expect, test } from 'bun:test';
import Fastify from 'fastify';

test('Fastify exposes the primitive value that its body schema actually validated', async () => {
    const app = Fastify();
    try {
        app.post('/', {
            schema: { body: { type: 'integer', minimum: 1, maximum: 10 } },
            handler: (request) => ({ value: request.body, type: typeof request.body }),
        });
        const response = await app.inject({
            method: 'POST',
            url: '/',
            payload: '"10"',
            headers: { 'content-type': 'application/json' },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ value: 10, type: 'number' });
    } finally {
        await app.close();
    }
});
