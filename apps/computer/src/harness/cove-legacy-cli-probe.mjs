import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Actual pinned old CLI bytes against fresh upgraded-Server refusal responses. */
export async function legacyCreationRefusals(fixture, legacyRepo) {
    const root = await mkdtemp(join(tmpdir(), 'haus-legacy-cli-refusal-'));
    try {
        const script = join(root, 'probe.mjs');
        await writeFile(
            script,
            `import {runAgentCli} from ${JSON.stringify(pathToFileURL(`${legacyRepo}/apps/computer/src/agent-cli.ts`).href)}; process.exit(await runAgentCli(process.argv.slice(2)));`
        );
        const results = [];
        for (const brief of [null, 'Own synthetic delivery-evidence checks.']) {
            const runner = await fixture.mintRunner(
                `run_old_cli_refusal_${brief === null}`,
                fixture.coveAgentId,
                fixture.channelId,
                false
            );
            await fetch(new URL('/api/agent/history?target=%23product', fixture.harness.url), {
                headers: { authorization: `Bearer ${runner.token}` },
            });
            const tokenPath = join(root, 'token');
            const localToken = `grta_${randomBytes(32).toString('base64url')}`;
            await writeFile(tokenPath, localToken, { mode: 0o600 });
            const proxy = Bun.serve({
                hostname: '127.0.0.1',
                port: 0,
                async fetch(request) {
                    if (request.headers.get('authorization') !== `Bearer ${localToken}`) {
                        return new Response('Unauthorized', { status: 401 });
                    }
                    const url = new URL(request.url);
                    const headers = new Headers(request.headers);
                    headers.set('authorization', `Bearer ${runner.token}`);
                    headers.delete('host');
                    return fetch(new URL(url.pathname + url.search, fixture.harness.url), {
                        method: request.method,
                        headers,
                        body: request.method === 'GET' ? undefined : await request.text(),
                    });
                },
            });
            const argv = [
                'agent',
                'create',
                '--target',
                '#product',
                '--name',
                `Refusal probe ${brief === null}`,
                '--description',
                'Synthetic refusal probe.',
            ];
            if (brief) {
                argv.push('--brief', brief);
            }
            const child = Bun.spawn([process.execPath, script, ...argv], {
                cwd: root,
                env: {
                    ...process.env,
                    HAUS_SERVER_URL: proxy.url.toString(),
                    HAUS_AGENT_TOKEN_FILE: tokenPath,
                    HAUS_AGENT_ID: fixture.coveAgentId,
                },
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const [stdout, stderr, exitCode] = await Promise.all([
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
                child.exited,
            ]);
            proxy.stop(true);
            results.push({ briefPresent: brief !== null, stdout, stderr, exitCode });
        }
        return results;
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
