import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireCompiledIcon, syncOptionalAssetCatalog } from './macos-app-icon.mjs';

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});

describe('syncOptionalAssetCatalog', () => {
    test('removes a stale catalog when actool emits only an ICNS file', () => {
        const directory = makeTemporaryDirectory();
        const destinationPath = path.join(directory, 'Assets.car');
        writeFileSync(destinationPath, 'stale');

        expect(
            syncOptionalAssetCatalog({
                destinationPath,
                sourcePath: path.join(directory, 'missing.car'),
            })
        ).toBe(false);
        expect(existsSync(destinationPath)).toBe(false);
    });

    test('copies the catalog when actool emits one', () => {
        const directory = makeTemporaryDirectory();
        const sourcePath = path.join(directory, 'compiled.car');
        const destinationPath = path.join(directory, 'Assets.car');
        writeFileSync(sourcePath, 'compiled');

        expect(syncOptionalAssetCatalog({ destinationPath, sourcePath })).toBe(true);
        expect(readFileSync(destinationPath, 'utf8')).toBe('compiled');
    });
});

describe('requireCompiledIcon', () => {
    test('accepts output compiled from the Icon Composer source', () => {
        const directory = makeTemporaryDirectory();
        const compiledIconPath = path.join(directory, 'compiled.icns');
        writeFileSync(compiledIconPath, 'compiled');

        expect(() => requireCompiledIcon(compiledIconPath)).not.toThrow();
    });

    test('fails explicitly when Xcode emits no ICNS file', () => {
        const directory = makeTemporaryDirectory();

        expect(() => requireCompiledIcon(path.join(directory, 'missing.icns'))).toThrow(
            'actool emitted no ICNS file; Xcode 27 or newer is required'
        );
    });
});

function makeTemporaryDirectory() {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-icon-test-'));
    temporaryDirectories.push(directory);
    return directory;
}
