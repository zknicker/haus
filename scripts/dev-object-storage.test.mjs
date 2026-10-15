import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    prepareDevObjectStorage,
    reserveDevObjectStoragePort,
    shouldRunDevObjectStorage,
    stopStaleDevObjectStorage,
    waitForDevObjectStorage,
} from './dev-object-storage.mjs';

const filesEnvironment = {
    HAUS_ARTIFACT_R2_ACCESS_KEY_ID: 'haus-dev-files',
    HAUS_ARTIFACT_R2_BUCKET: 'haus-artifacts-development',
    HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY: 'haus-dev-files-secret',
    HAUS_ENABLE_ARTIFACT_STORAGE: 'true',
};

test('the gateway runs only for enabled Files storage without an explicit endpoint', () => {
    assert.equal(shouldRunDevObjectStorage(filesEnvironment), true);
    assert.equal(
        shouldRunDevObjectStorage({ ...filesEnvironment, HAUS_ENABLE_ARTIFACT_STORAGE: 'false' }),
        false
    );
    assert.equal(
        shouldRunDevObjectStorage({
            ...filesEnvironment,
            HAUS_ARTIFACT_R2_ENDPOINT: 'https://r2.example.test',
        }),
        false
    );
});

test('prepares a loopback gateway with the bucket directory and credentials off argv', () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-object-storage-'));
    try {
        const storage = prepareDevObjectStorage(
            { ...filesEnvironment, HAUS_OBJECT_STORAGE_ROOT: storageRoot },
            43_210,
            { executable: '/bin/versitygw' }
        );
        assert.equal(storage.endpoint, 'http://127.0.0.1:43210');
        assert.ok(fs.statSync(path.join(storageRoot, 'data', 'haus-artifacts-development')));
        assert.deepEqual(storage.env, {
            ROOT_ACCESS_KEY_ID: 'haus-dev-files',
            ROOT_SECRET_ACCESS_KEY: 'haus-dev-files-secret',
        });
        assert.equal(storage.args.includes('haus-dev-files-secret'), false);
        assert.deepEqual(storage.args.slice(0, 4), [
            '--port',
            '127.0.0.1:43210',
            '--region',
            'auto',
        ]);
    } finally {
        fs.rmSync(storageRoot, { force: true, recursive: true });
    }
});

test('stale cleanup stops only this worktree gateway', () => {
    const storageRoot = '/state/object-storage';
    const killed = [];
    const fileSystem = {
        existsSync: () => true,
        readFileSync: () => '4242\n',
        rmSync: () => undefined,
    };
    const stop = (command) =>
        stopStaleDevObjectStorage(
            { HAUS_OBJECT_STORAGE_ROOT: storageRoot },
            {
                fileSystem,
                killProcess: (pid, signal) => killed.push({ pid, signal }),
                readCommand: () => command,
            }
        );

    assert.equal(stop(`versitygw --port 127.0.0.1:1 posix ${storageRoot}/data`), 1);
    assert.equal(stop('/usr/bin/some-other-process'), 0);
    assert.equal(stop(''), 0);
    assert.deepEqual(killed, [{ pid: 4242, signal: 'SIGTERM' }]);
});

const hasGateway = spawnSync('versitygw', ['--version'], { stdio: 'ignore' }).status === 0;

// Proves the Server's R2 client contract (region `auto`, path style, multipart,
// ranged reads, signed GETs) against the real gateway when it is installed.
test('the Server S3 client round-trips through the gateway', { skip: !hasGateway }, async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-object-storage-'));
    const storage = prepareDevObjectStorage(
        { ...filesEnvironment, HAUS_OBJECT_STORAGE_ROOT: storageRoot },
        await reserveDevObjectStoragePort(),
        { executable: 'versitygw' }
    );
    const child = spawn(storage.executable, storage.args, {
        env: { ...process.env, ...storage.env },
        stdio: 'ignore',
    });
    try {
        await waitForDevObjectStorage(storage, child);
        const client = new Bun.S3Client({
            accessKeyId: filesEnvironment.HAUS_ARTIFACT_R2_ACCESS_KEY_ID,
            bucket: filesEnvironment.HAUS_ARTIFACT_R2_BUCKET,
            endpoint: storage.endpoint,
            region: 'auto',
            secretAccessKey: filesEnvironment.HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY,
        });
        const bytes = new Uint8Array(6 * 1024 * 1024).fill(7);
        await client.file('srv/rev/original').write(new Response(bytes), {
            partSize: 5 * 1024 * 1024,
            queueSize: 1,
            type: 'image/png',
        });
        assert.equal((await client.file('srv/rev/original').slice(0, 4).bytes()).length, 4);
        const signed = await fetch(
            client.file('srv/rev/original').presign({ expiresIn: 300, method: 'GET' })
        );
        assert.equal(signed.status, 200);
        assert.equal(signed.headers.get('content-type'), 'image/png');
        assert.equal((await signed.arrayBuffer()).byteLength, bytes.byteLength);
        await client.delete('srv/rev/original');
        await client.delete('srv/rev/never-written');
        assert.equal(await client.file('srv/rev/original').exists(), false);
    } finally {
        child.kill('SIGTERM');
        fs.rmSync(storageRoot, { force: true, recursive: true });
    }
});
