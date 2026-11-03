import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveReleaseSnapshot } from '../../../scripts/release/release-snapshot.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

test('builds one versioned Apple Silicon Server artifact with App and operations assets', async () => {
    const sourceRevision = '0123456789abcdef0123456789abcdef01234567';
    const product = JSON.parse(
        readFileSync(join(repoRoot, 'packages/haus-api/haus-product.json'), 'utf8')
    ) as { version: string };
    const ledger = JSON.parse(readFileSync(join(repoRoot, 'releases.json'), 'utf8'));
    const serverVersion = resolveReleaseSnapshot(ledger, { sourceRevision }).components.server;
    if (!serverVersion) {
        throw new Error('release ledger must contain a Server version');
    }
    const releaseId = `${serverVersion}+git.${sourceRevision.slice(0, 12)}`;
    const artifact = join(
        repoRoot,
        'apps/server/release',
        `haus-server-${releaseId}-aarch64-apple-darwin.tar.gz`
    );
    const build = Bun.spawn([Bun.which('bun') ?? 'bun', 'scripts/build-haus-server-artifact.mjs'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            HAUS_SERVER_VERSION: serverVersion,
            HAUS_SOURCE_REVISION: sourceRevision,
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([build.exited, new Response(build.stderr).text()]);
    if (exitCode !== 0) {
        throw new Error(`Artifact build failed: ${stderr}`);
    }

    const archive = Bun.spawnSync(['/usr/bin/tar', '-tzf', artifact], {
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const verboseArchive = Bun.spawnSync(['/usr/bin/tar', '-tvzf', artifact], {
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const paths = archive.stdout.toString();
    expect(archive.exitCode).toBe(0);
    expect(verboseArchive.exitCode).toBe(0);
    expect(paths).toContain('./bin/haus-server');
    expect(paths).toContain('./bin/haus-server-bootstrap');
    expect(paths).toContain('./bin/haus-server-migrate');
    expect(paths).not.toContain('./bin/haus-server-backup');
    expect(paths).not.toContain('./bin/haus-server-restore');
    expect(paths).not.toContain('./bin/haus-server-monitor');
    expect(paths).toContain('./bin/haus-server-deploy');
    expect(paths).toContain('./bin/activate-haus-server');
    expect(paths).toContain('./release-files.sha256');
    expect(paths).toContain('./release.json');
    expect(paths).toContain('./share/haus-server/app/haus-app-icon.png');
    expect(paths).toContain('./share/haus-server/app/index.html');
    expect(paths).toContain('./share/haus-server/app/privacy.html');
    expect(paths).toContain('./share/haus-server/hosted-mcp/skool/python/bin/python3.12');
    expect(paths).toContain('./share/haus-server/hosted-mcp/skool/hosted/managed.py');
    expect(paths).toContain('./share/haus-server/migrations/0000_baseline.sql');
    expect(paths).toContain('./share/haus-server/migrations/0001_chat-anchor-fk.sql');
    expect(paths).toContain(
        './share/haus-server/migrations/0002_defer-server-purge-constraints.sql'
    );
    expect(paths).toContain('./share/haus-server/migrations/meta/_journal.json');
    expect(paths).toContain('./compose.yml');
    expect(paths).toContain('./colima/com.merchbaseco.colima-autostart.plist');
    expect(paths).toContain('./launchd/com.haus.server.plist');
    expect(paths).toContain('./launchd/com.haus.tunnel.plist');
    expect(paths).not.toContain('./launchd/com.haus.backup.plist');
    expect(paths).not.toContain('./launchd/com.haus.monitor.plist');
    expect(paths).not.toContain('./launchd/com.haus.postgresql.plist');
    expect(paths).toContain('./host-services/haus-server-activation.sudoers');
    expect(paths).toContain('./operations/install-colima-boot');
    expect(paths).toContain('./operations/launchctl-service-disabled');
    expect(paths).toContain('./operations/rollback-colima-boot');
    expect(paths).toContain('./operations/run-server');
    expect(paths).not.toContain('./operations/run-backup');
    expect(paths).not.toContain('./operations/run-restore');
    // Runtime configuration is rendered from `.env.schema` by the deploy job,
    // so the artifact ships no environment example of any kind.
    expect(paths).not.toContain('./config/server.env.example');
    expect(paths).not.toContain('./config/migration.env.example');
    expect(paths).not.toContain('./config/backup.env.example');
    expect(paths).not.toContain('./config/restore.env.example');
    expect(paths).toContain('./config/cloudflared.yml.example');
    expect(verboseArchive.stdout.toString()).toMatch(
        /-rwxr-xr-x .* \.\/operations\/install-colima-boot/u
    );
    expect(verboseArchive.stdout.toString()).toMatch(
        /-rwxr-xr-x .* \.\/operations\/rollback-colima-boot/u
    );
    expect(verboseArchive.stdout.toString()).toMatch(/-rwxr-xr-x .* \.\/bin\/haus-server-deploy/u);

    const unpacked = mkdtempSync(join(tmpdir(), 'haus-release-'));
    try {
        const extract = Bun.spawnSync(['/usr/bin/tar', '-xzf', artifact, '-C', unpacked], {
            stderr: 'pipe',
            stdout: 'pipe',
        });
        expect(extract.exitCode).toBe(0);
        expect(
            Bun.spawnSync(['/usr/bin/shasum', '-a', '256', '-c', 'release-files.sha256'], {
                cwd: unpacked,
                stderr: 'pipe',
                stdout: 'pipe',
            }).exitCode
        ).toBe(0);
        expect(
            Bun.spawnSync(['/usr/bin/file', '-b', 'bin/haus-server-deploy'], {
                cwd: unpacked,
            }).stdout.toString()
        ).toMatch(/Mach-O.*arm64/u);

        const release = JSON.parse(readFileSync(join(unpacked, 'release.json'), 'utf8')) as {
            contentDigest: string;
            productVersion: string;
            releaseId: string;
            serverVersion: string;
            sourceRevision: string;
        };
        expect(release).toEqual({
            contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
            productVersion: product.version,
            releaseId,
            serverVersion,
            sourceRevision,
        });
    } finally {
        rmSync(unpacked, { force: true, recursive: true });
    }
}, 120_000);
