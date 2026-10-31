#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageHostedMcp, packageLinearHostedMcp } from './package-hosted-mcp.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const releaseRoot = path.join(repoRoot, 'apps', 'server', 'release');
const stageRoot = path.join(releaseRoot, 'stage');
const sourceRevision = process.env.HAUS_SOURCE_REVISION?.trim() ?? '';
if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error('HAUS_SOURCE_REVISION must be a full lowercase Git commit SHA.');
}
const product = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'packages', 'haus-api', 'haus-product.json'), 'utf8')
);
const serverVersion = process.env.HAUS_SERVER_VERSION?.trim() ?? '';
if (!/^\d+\.\d+\.\d+$/.test(serverVersion)) {
    throw new Error('HAUS_SERVER_VERSION must be exact SemVer.');
}
const releaseId = `${serverVersion}+git.${sourceRevision.slice(0, 12)}`;
const artifactName = `haus-server-${releaseId}-aarch64-apple-darwin.tar.gz`;
const artifactPath = path.join(releaseRoot, artifactName);

await fs.rm(releaseRoot, { force: true, recursive: true });
await fs.mkdir(path.join(stageRoot, 'bin'), { recursive: true });

const binaries = [
    ['activate-haus-server', 'haus-server-activation.ts'],
    ['haus-server', 'haus-server.ts'],
    ['haus-server-bootstrap', 'haus-server-bootstrap.ts'],
    ['haus-server-migrate', 'haus-server-migrate.ts'],
];
for (const [name, source] of binaries) {
    run('bun', [
        'build',
        `apps/server/src/${source}`,
        '--compile',
        '--compile-autoload-package-json',
        '--target=bun-darwin-arm64',
        '--outfile',
        path.join(stageRoot, 'bin', name),
    ]);
}
run('bun', [
    'build',
    'scripts/deploy-haus-server.ts',
    '--compile',
    '--compile-autoload-package-json',
    '--target=bun-darwin-arm64',
    '--outfile',
    path.join(stageRoot, 'bin', 'haus-server-deploy'),
]);
for (const [name] of [...binaries, ['haus-server-deploy']]) {
    assertAppleSiliconExecutable(path.join(stageRoot, 'bin', name));
}

run(
    'bun',
    ['x', 'vite', 'build', '--outDir', path.join(stageRoot, 'share', 'haus-server', 'app')],
    {
        cwd: path.join(repoRoot, 'apps', 'website'),
        env: { ...process.env, HAUS_HOSTED_APP: '1' },
    }
);

await fs.cp(path.join(repoRoot, 'apps', 'server', 'launchd'), path.join(stageRoot, 'launchd'), {
    recursive: true,
});
await fs.cp(
    path.join(repoRoot, 'apps', 'server', 'host-services'),
    path.join(stageRoot, 'host-services'),
    { recursive: true }
);
await fs.cp(path.join(repoRoot, 'apps', 'server', 'colima'), path.join(stageRoot, 'colima'), {
    recursive: true,
});
await fs.copyFile(
    path.join(repoRoot, 'apps', 'server', 'compose.yml'),
    path.join(stageRoot, 'compose.yml')
);
await fs.cp(path.join(repoRoot, 'apps', 'server', 'config'), path.join(stageRoot, 'config'), {
    recursive: true,
});
await fs.cp(
    path.join(repoRoot, 'apps', 'server', 'drizzle', 'postgres'),
    path.join(stageRoot, 'share', 'haus-server', 'migrations'),
    { recursive: true }
);
await fs.cp(
    path.join(repoRoot, 'apps', 'server', 'recovery'),
    path.join(stageRoot, 'share', 'haus-server', 'recovery'),
    { recursive: true }
);
await fs.cp(
    path.join(repoRoot, 'apps', 'server', 'operations'),
    path.join(stageRoot, 'operations'),
    { recursive: true }
);
for (const operation of ['install-colima-boot', 'rollback-colima-boot', 'run-server']) {
    await fs.chmod(path.join(stageRoot, 'operations', operation), 0o755);
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Server hosted MCP packaging requires an Apple Silicon macOS builder.');
}
await packageHostedMcp(path.join(stageRoot, 'share/haus-server/hosted-mcp/skool'));
await packageLinearHostedMcp(path.join(stageRoot, 'share/haus-server/hosted-mcp/linear'));

const contentDigest = await writeReleaseChecksums(stageRoot);
await fs.writeFile(
    path.join(stageRoot, 'release.json'),
    `${JSON.stringify(
        {
            contentDigest,
            productVersion: product.version,
            releaseId,
            serverVersion,
            sourceRevision,
        },
        null,
        2
    )}\n`
);

await fs.mkdir(releaseRoot, { recursive: true });
run('tar', ['-czf', artifactPath, '-C', stageRoot, '.']);
await fs.writeFile(`${artifactPath}.sha256`, `${await sha256(artifactPath)}  ${artifactName}\n`);
console.log(`Built ${path.relative(repoRoot, artifactPath)}`);

function run(command, args, options = {}) {
    execFileSync(command, args, {
        cwd: options.cwd ?? repoRoot,
        env: options.env ?? process.env,
        stdio: 'inherit',
    });
}

function assertAppleSiliconExecutable(filePath) {
    const description = execFileSync('/usr/bin/file', ['-b', filePath], { encoding: 'utf8' });
    if (!(description.includes('Mach-O') && description.includes('arm64'))) {
        throw new Error(`${path.basename(filePath)} is not an Apple Silicon Mach-O executable`);
    }
}

async function sha256(filePath) {
    const hash = createHash('sha256');
    await new Promise((resolve, reject) => {
        createReadStream(filePath)
            .on('data', (chunk) => hash.update(chunk))
            .on('error', reject)
            .on('end', resolve);
    });
    return hash.digest('hex');
}

async function writeReleaseChecksums(root) {
    const files = await listFiles(root);
    const checksumPath = path.join(root, 'release-files.sha256');
    const lines = [];

    for (const relativePath of files) {
        lines.push(`${await sha256(path.join(root, relativePath))}  ./${relativePath}\n`);
    }

    await fs.writeFile(checksumPath, lines.join(''));
    return await sha256(checksumPath);
}

async function listFiles(root, relativeRoot = '') {
    const directory = path.join(root, relativeRoot);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const relativePath = path.posix.join(relativeRoot, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listFiles(root, relativePath)));
        } else if (entry.isFile()) {
            files.push(relativePath);
        } else {
            throw new Error(`Unsupported release entry: ${relativePath}`);
        }
    }

    return files.sort();
}
