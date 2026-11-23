'use strict';

const { readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appWindowOf, assertTrustedRenderer } = require('./trusted-renderer.cjs');

function registerRepoFolderIpc({ appUrl, dataRoot = computerDataRoot(process.env), ipcMain }) {
    ipcMain.handle('desktop:repo-folder:pick', async (event) => {
        const { BrowserWindow, dialog } = require('electron');
        const window = appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only a Haus window can choose a folder.',
        });
        return folderPickReply(await dialog.showOpenDialog(window, folderPickOptions));
    });
    ipcMain.handle('desktop:repo-folder:local-computer', (event, serverId) => {
        assertTrustedRenderer(event, appUrl);
        return readLocalComputerId(dataRoot, serverId);
    });
}

const folderPickOptions = {
    buttonLabel: 'Choose',
    message: 'Choose a git checkout whose origin is on GitHub.',
    properties: ['openDirectory'],
};

function folderPickReply(result) {
    const [picked] = result?.canceled ? [] : (result?.filePaths ?? []);
    return typeof picked === 'string' && picked.startsWith('/')
        ? { path: picked, status: 'picked' }
        : { status: 'canceled' };
}

async function readLocalComputerId(dataRoot, serverId) {
    if (!(typeof serverId === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(serverId))) {
        return null;
    }
    let attachment;
    try {
        attachment = JSON.parse(
            await readFile(path.join(dataRoot, 'servers', serverId, 'attachment.json'), 'utf8')
        );
    } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) {
            return null;
        }
        throw error;
    }
    const computerId = attachment?.computerId;
    return attachment?.serverId === serverId && typeof computerId === 'string' ? computerId : null;
}

function computerDataRoot(environment) {
    return environment.HAUS_COMPUTER_DATA_ROOT ?? path.join(os.homedir(), '.haus', 'computer');
}

module.exports = {
    computerDataRoot,
    folderPickOptions,
    folderPickReply,
    readLocalComputerId,
    registerRepoFolderIpc,
};
