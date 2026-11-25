import type { DriveServer } from './drive-server.fixture.ts';

export function startAuthority(drive: DriveServer, mintGate: Promise<void> = Promise.resolve()) {
    const minted: unknown[] = [];
    const revoked: unknown[] = [];
    const front = Bun.serve({
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/runner/mint') {
                const body = (await request.json()) as { agentId: string };
                minted.push(body);
                await mintGate;
                return Response.json({
                    runnerId: `arc_${minted.length}`,
                    runnerToken: body.agentId,
                });
            }
            if (url.pathname === '/computer/runner/revoke') {
                revoked.push(await request.json());
                return Response.json({});
            }
            return await fetch(new URL(`${url.pathname}${url.search}`, drive.origin), {
                body: request.body,
                headers: request.headers,
                method: request.method,
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    return { minted, revoked, server: front };
}
