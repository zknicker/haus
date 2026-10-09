import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import { hausFastifyOptions } from './haus-fastify-options.ts';

// The App opens with a batch of eight procedures; Fastify's 100-character
// default silently 404d it, so Members and Computers loaded with no data.
const openingBatchPath =
    'server.list,server.bySlug,agent.list,chat.list,member.list,stats.live,computer.list,agent.activeActivity';

test('routes a tRPC batch path longer than Fastify’s default parameter limit', async () => {
    const app = Fastify(hausFastifyOptions);
    app.post('/trpc/:path', async () => ({ ok: true }));

    const response = await app.inject({
        method: 'POST',
        url: `/trpc/${openingBatchPath}?batch=1`,
    });

    expect(openingBatchPath.length).toBeGreaterThan(100);
    expect(response.statusCode).toBe(200);
    await app.close();
});
