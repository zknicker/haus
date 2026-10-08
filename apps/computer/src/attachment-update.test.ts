import { expect, test } from 'bun:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFreePort } from './test-port.ts';
import { readUpdateProgress } from './update.ts';
import { computerProtocolVersion, computerReleaseSigningPayload } from './update-contract.ts';
import { finishRestart } from './update-recovery.ts';

for (const restartFails of [true, false]) {
    test(
        restartFails
            ? 'an unclean drain after install exits, and the restarted target version reports complete'
            : 'a rejected release leaves the attachment daemon running',
        async () => {
            const root = await mkdtemp(join(tmpdir(), 'haus-attachment-update-'));
            const bytes = Buffer.from('verified computer artifact');
            const server = Bun.serve({
                hostname: '127.0.0.1',
                port: await getFreePort(),
                fetch: () => new Response(bytes),
            });
            const keys = generateKeyPairSync('ed25519');
            const release = {
                artifactUrl: `http://127.0.0.1:${server.port}/computer`,
                protocolVersion: computerProtocolVersion,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                sourceRevision: 'b'.repeat(40),
                version: '999.0.0',
            };
            const signed = {
                release,
                signature: sign(
                    null,
                    Buffer.from(computerReleaseSigningPayload(release)),
                    keys.privateKey
                ).toString('base64'),
            };
            if (!restartFails) {
                signed.signature = Buffer.alloc(64).toString('base64');
            }
            const source = join(root, 'daemon.ts');
            const survived = join(root, 'survived');
            const module = new URL('./attachment-update.ts', import.meta.url).pathname;
            await writeFile(
                source,
                `
                import { writeFile } from 'node:fs/promises';
                import { runAttachmentUpdate } from ${JSON.stringify(module)};
                try {
                    await runAttachmentUpdate({
                        dataRoot: ${JSON.stringify(root)},
                        currentVersion: '1.0.0',
                        publicKey: ${JSON.stringify(keys.publicKey.export({ format: 'pem', type: 'spki' }).toString())},
                        release: ${JSON.stringify(signed)},
                        install: async () => {},
                        verifyArtifact: async () => {},
                        restart: async () => { throw new Error('ManagedRuntime disposed during shutdown'); },
                    });
                } catch {
                    await writeFile(${JSON.stringify(survived)}, 'still running');
                }
                setInterval(() => {}, 1000);
            `
            );
            const daemon = Bun.spawn([process.execPath, source], {
                stdout: 'ignore',
                stderr: 'pipe',
            });
            try {
                const deadline = Date.now() + 3000;
                while (
                    daemon.exitCode === null &&
                    !(await Bun.file(survived).exists()) &&
                    Date.now() < deadline
                ) {
                    await Bun.sleep(10);
                }
                const progress = await readUpdateProgress(root);
                expect(await Bun.file(join(root, 'update-job.lock')).exists()).toBe(false);
                if (restartFails) {
                    expect(daemon.exitCode).toBe(1);
                    expect(await Bun.file(survived).exists()).toBe(false);
                    // The executable is installed, so the drain error is not an update failure.
                    expect(progress).toMatchObject({ failedPhase: null, phase: 'restarting' });
                    await finishRestart(root, release.version);
                    expect(await readUpdateProgress(root)).toMatchObject({
                        phase: 'complete',
                        targetVersion: release.version,
                    });
                } else {
                    expect(progress.phase).toBe('failed');
                    expect(daemon.exitCode).toBeNull();
                    expect(progress.failedPhase).toBe('verifying');
                    expect(await readFile(survived, 'utf8')).toBe('still running');
                }
            } finally {
                daemon.kill('SIGKILL');
                await daemon.exited;
                server.stop(true);
                await rm(root, { recursive: true, force: true });
            }
        }
    );
}
