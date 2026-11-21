import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    computerReleaseArtifactPath,
    computerReleaseRoot,
    verifyAppleSignature,
    verifyComputerIdentity,
} from './build-computer-artifact.mjs';
import { extractComputerApp } from './computer-app-bundle.mjs';
import {
    computerArtifactName,
    sha256File,
    verifySignedComputerRelease,
} from './computer-release-contract.mjs';
import { ensureComputerGithubRelease, ensureComputerReleaseTag } from './computer-release-tags.mjs';
import { fail, repoRoot } from './release-utils.mjs';

export async function publishImmutableObjects(input) {
    const root = `${input.s3Root}/computer/${input.version}`;
    for (const [file, name] of [
        [input.artifactPath, computerArtifactName],
        [input.descriptorPath, 'release.json'],
        [input.installerPath, 'install.sh'],
    ]) {
        const uri = `${root}/${name}`;
        await ensureImmutableObject(file, uri);
    }
}

export function assertImmutableObjectAbsent(uri, execute = spawnSync) {
    if (immutableObjectExists(uri, execute)) {
        throw new Error(`Immutable Computer release object already exists: ${uri}`);
    }
}

export function immutableObjectExists(uri, execute = spawnSync) {
    const result = execute('aws', ['s3', 'ls', uri], { encoding: 'utf8' });
    const stdout = result.stdout?.trim() ?? '';
    const stderr = result.stderr?.trim() ?? '';
    if (result.status === 1 && !result.error && !stdout && !stderr) {
        return false;
    }
    if (result.status !== 0) {
        throw new Error(`Could not check immutable Computer release object: ${uri}`);
    }
    return Boolean(stdout);
}

export async function ensureImmutableObject(file, uri, options = {}) {
    const exists = options.exists ?? immutableObjectExists;
    const copy = options.copy ?? copyS3Object;
    if (!exists(uri)) {
        copy(file, uri);
        return 'published';
    }
    const sha256 = options.sha256 ?? sha256File;
    const readRemoteSha256 = options.readRemoteSha256 ?? downloadImmutableSha256;
    if ((await sha256(file)) !== (await readRemoteSha256(uri))) {
        throw new Error(`Immutable Computer release object differs from local release: ${uri}`);
    }
    console.log(`Reusing matching immutable Computer release object: ${uri}`);
    return 'reused';
}

export async function recoverImmutableComputerArtifact(input) {
    const uri = `${input.s3Root}/computer/${input.version}/${computerArtifactName}`;
    if (!immutableObjectExists(uri)) {
        return null;
    }
    await rm(computerReleaseRoot, { force: true, recursive: true });
    await mkdir(computerReleaseRoot, { recursive: true });
    const artifactPath = computerReleaseArtifactPath;
    copyS3Object(uri, artifactPath);
    const appPath = extractComputerApp(artifactPath, computerReleaseRoot);
    await verifyComputerIdentity(verifyAppleSignature(appPath, input), input);
    console.log(`Recovered verified immutable Computer artifact: ${uri}`);
    return { appPath, artifactPath };
}

export function publishedComputerReleaseMatchesSource(production, candidate) {
    const release = production?.release;
    return Boolean(
        release &&
        release.version === candidate.version &&
        release.sourceRevision === candidate.sourceRevision
    );
}

export function computerReleaseIsAlreadyPublished(production, candidate) {
    return (
        publishedComputerReleaseMatchesSource(production, candidate) &&
        production.release.sha256 === candidate.sha256
    );
}

// A publish that fails after promotion (a dropped tag push, for example) must be resumable.
// The already-promoted artifact is the candidate only when version, source, and digest all match.
export async function recoverPublishedComputerRelease(input) {
    if (
        !publishedComputerReleaseMatchesSource(input.production, {
            sourceRevision: input.sourceRevision,
            version: input.version,
        })
    ) {
        return null;
    }
    const recovered = await recoverImmutableComputerArtifact(input);
    if (!recovered) {
        return null;
    }
    const artifactPath = recovered.artifactPath;
    const candidate = {
        sha256: await sha256File(artifactPath),
        sourceRevision: input.sourceRevision,
        version: input.version,
    };
    return computerReleaseIsAlreadyPublished(input.production, candidate)
        ? { artifactPath, descriptor: input.production }
        : null;
}

export async function completePublishedComputerRelease(input) {
    const descriptorPath = path.join(path.dirname(input.artifactPath), 'release.json');
    await writeFile(descriptorPath, `${JSON.stringify(input.descriptor, null, 2)}\n`);
    ensureComputerReleaseTag(input.version, input.sourceRevision);
    ensureComputerGithubRelease(input.version, {
        assets: [input.artifactPath, descriptorPath, input.installerPath],
        sourceRevision: input.sourceRevision,
    });
}

export async function readProductionComputerRelease(url, publicKey, request = fetch) {
    const response = await request(url, { cache: 'no-store' });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`Production Computer descriptor returned ${response.status}.`);
    }
    const descriptor = await response.json();
    verifySignedComputerRelease(descriptor, publicKey);
    return descriptor;
}

export async function verifyPublicObjects(input) {
    const descriptor = await verifyPublicDescriptor(
        `${input.releaseBaseUrl}/${input.version}/release.json`,
        input.descriptor,
        input.publicKey
    );
    const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-public-'));
    try {
        const artifactPath = path.join(root, computerArtifactName);
        const response = await retryPublicVerification('public Computer artifact', async () => {
            const candidate = await fetch(descriptor.release.artifactUrl, { cache: 'no-store' });
            if (!candidate.ok) {
                throw new Error(`returned ${candidate.status}`);
            }
            return candidate;
        });
        await writeFile(artifactPath, Buffer.from(await response.arrayBuffer()), { mode: 0o644 });
        if ((await sha256File(artifactPath)) !== descriptor.release.sha256) {
            fail('public Computer artifact digest does not match descriptor');
        }
        const appPath = extractComputerApp(artifactPath, root);
        await verifyComputerIdentity(verifyAppleSignature(appPath, input), input);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

export function promoteLatest(descriptorPath, s3Root) {
    run('aws', [
        's3',
        'cp',
        descriptorPath,
        `${s3Root}/computer/latest.json`,
        '--cache-control',
        'no-cache',
    ]);
}

export async function promoteInstaller(installerPath, input) {
    run('aws', [
        's3',
        'cp',
        installerPath,
        `${input.s3Root}/computer/install.sh`,
        '--cache-control',
        'no-cache',
        '--content-type',
        'text/x-shellscript',
    ]);
    const expected = await readFile(installerPath, 'utf8');
    await retryPublicVerification('public Computer installer', async () => {
        const response = await fetch(`${input.releaseBaseUrl}/install.sh`, {
            cache: 'no-store',
        });
        if (!response.ok || (await response.text()) !== expected) {
            throw new Error(response.ok ? 'content differs' : `returned ${response.status}`);
        }
    });
}

export async function verifyPublicDescriptor(url, expected, publicKey) {
    return await retryPublicVerification(`public Computer descriptor ${url}`, async () => {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`returned ${response.status}`);
        }
        const descriptor = await response.json();
        verifySignedComputerRelease(descriptor, publicKey);
        if (JSON.stringify(descriptor) !== JSON.stringify(expected)) {
            throw new Error('content differs from release');
        }
        return descriptor;
    });
}

async function retryPublicVerification(description, verify) {
    let lastError;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
        try {
            return await verify();
        } catch (error) {
            lastError = error;
            if (attempt < 30) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }
    fail(`${description} verification failed`, {
        message: lastError instanceof Error ? lastError.message : String(lastError),
    });
}

async function downloadImmutableSha256(uri) {
    const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-immutable-'));
    try {
        const file = path.join(root, 'object');
        copyS3Object(uri, file);
        return await sha256File(file);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

function copyS3Object(source, destination) {
    run('aws', ['s3', 'cp', source, destination]);
}

function run(command, args) {
    execFileSync(command, args, { cwd: repoRoot, env: process.env, stdio: 'inherit' });
}
