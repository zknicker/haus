'use strict';

const { mkdir, mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { expect, test } = require('bun:test');
const desktopBuild = require('../electron-builder.config.cjs');
const {
    computerDataRoot,
    folderPickOptions,
    folderPickReply,
    readLocalComputerId,
} = require('./repo-folder-ipc.cjs');

test('desktop builds package the repo folder module', () => {
    expect(desktopBuild.files).toContain('electron/repo-folder-ipc.cjs');
});

test('the picker chooses one folder, never a file', () => {
    expect(folderPickOptions.properties).toEqual(['openDirectory']);
});

test('a picked absolute folder comes back; a cancel or anything else is canceled', () => {
    expect(folderPickReply({ canceled: false, filePaths: ['/Users/ada/src/haus'] })).toEqual({
        path: '/Users/ada/src/haus',
        status: 'picked',
    });
    expect(folderPickReply({ canceled: true, filePaths: ['/Users/ada/src/haus'] })).toEqual({
        status: 'canceled',
    });
    expect(folderPickReply({ canceled: false, filePaths: [] })).toEqual({ status: 'canceled' });
    expect(folderPickReply({ canceled: false, filePaths: ['relative'] })).toEqual({
        status: 'canceled',
    });
});

test("this Mac's Computer id comes from its attachment, and never its credential", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'haus-repo-folder-'));
    await mkdir(path.join(root, 'servers', 'srv_1'), { recursive: true });
    await writeFile(
        path.join(root, 'servers', 'srv_1', 'attachment.json'),
        JSON.stringify({ computerId: 'cmp_1', credential: 'secret', serverId: 'srv_1' })
    );
    await mkdir(path.join(root, 'servers', 'srv_broken'), { recursive: true });
    await writeFile(path.join(root, 'servers', 'srv_broken', 'attachment.json'), '{');

    expect(await readLocalComputerId(root, 'srv_1')).toBe('cmp_1');
    expect(await readLocalComputerId(root, 'srv_2')).toBeNull();
    expect(await readLocalComputerId(root, 'srv_broken')).toBeNull();
    expect(await readLocalComputerId(root, '../srv_1')).toBeNull();
    expect(await readLocalComputerId(root, 42)).toBeNull();
});

test('the data root follows the Computer: its override, else ~/.haus/computer', () => {
    expect(computerDataRoot({ HAUS_COMPUTER_DATA_ROOT: '/tmp/dev-computer' })).toBe(
        '/tmp/dev-computer'
    );
    expect(computerDataRoot({})).toBe(path.join(os.homedir(), '.haus', 'computer'));
});
