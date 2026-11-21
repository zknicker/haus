import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { arch, platform } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installer = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'install-haus-computer.sh'
);
const unreachableManifest = 'http://127.0.0.1:9/latest.json';
const appleSilicon = platform() === 'darwin' && arch() === 'arm64';
const rosetta =
    appleSilicon && spawnSync('/usr/bin/arch', ['-x86_64', '/usr/bin/true']).status === 0;

const install = (command) =>
    spawnSync(command[0], [...command.slice(1), installer], {
        encoding: 'utf8',
        env: { ...process.env, HAUS_COMPUTER_RELEASE_MANIFEST_URL: unreachableManifest },
    });

const refusedPlatform = (result) =>
    result.status === 69 && result.stderr.includes('Apple Silicon Macs only');

test('an Apple Silicon Mac passes the platform check', { skip: !appleSilicon }, () => {
    const result = install(['/bin/sh']);
    assert.equal(refusedPlatform(result), false, result.stderr);
});

test('a Rosetta shell on Apple Silicon still passes the platform check', { skip: !rosetta }, () => {
    const result = install(['/usr/bin/arch', '-x86_64', '/bin/sh']);
    assert.equal(refusedPlatform(result), false, result.stderr);
});

test('any other machine is refused before anything downloads', { skip: appleSilicon }, () => {
    const result = install(['/bin/sh']);
    assert.equal(refusedPlatform(result), true, result.stderr);
});
