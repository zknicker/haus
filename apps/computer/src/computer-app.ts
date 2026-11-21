import { lstat, mkdir, readlink, rename, rm, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const computerAppName = 'Haus Computer.app';

const appExecutable = join('Contents', 'MacOS', 'haus-computer');

export function computerAppExecutable(appPath: string) {
    return join(appPath, appExecutable);
}

export function runningComputerApp(executable = process.execPath) {
    const suffix = `.app/${appExecutable}`;
    return executable.endsWith(suffix)
        ? executable.slice(0, -(suffix.length - '.app'.length))
        : null;
}

export function installedComputerApp() {
    return (
        process.env.HAUS_COMPUTER_APP_PATH ??
        runningComputerApp() ??
        join(homedir(), '.local', 'share', 'haus-computer', computerAppName)
    );
}

export function computerCliPath() {
    return (
        process.env.HAUS_COMPUTER_INSTALL_PATH ?? join(homedir(), '.local', 'bin', 'haus-computer')
    );
}

export async function linkComputerCli(appPath: string, cliPath = computerCliPath()) {
    const target = computerAppExecutable(appPath);
    if ((await readlink(cliPath).catch(() => null)) !== target) {
        await mkdir(dirname(cliPath), { recursive: true });
        const staged = `${cliPath}.link`;
        await rm(staged, { force: true });
        await symlink(target, staged);
        await rename(staged, cliPath);
    }
    await rm(`${cliPath}.prev`, { force: true });
    await rm(`${cliPath}.next`, { force: true });
}

export async function swapInComputerApp(staged: string, destination: string) {
    const previous = `${destination}.prev`;
    const hadCurrent = await exists(destination);
    if (hadCurrent) {
        await rm(previous, { force: true, recursive: true });
        await rename(destination, previous);
    }
    try {
        await rename(staged, destination);
    } catch (cause) {
        if (hadCurrent) {
            await rename(previous, destination);
        }
        await rm(staged, { force: true, recursive: true });
        throw new Error('The verified Haus Computer app could not be installed.', { cause });
    }
}

export async function restorePreviousComputerApp(destination: string) {
    const previous = `${destination}.prev`;
    const replaced = `${destination}.rollback`;
    if (!(await exists(previous))) {
        throw new Error('No previous verified Haus Computer is available.');
    }
    await rm(replaced, { force: true, recursive: true });
    await rename(destination, replaced);
    try {
        await rename(previous, destination);
    } catch (cause) {
        await rename(replaced, destination);
        throw new Error('Haus Computer rollback failed.', { cause });
    }
    await rename(replaced, previous);
}

async function exists(path: string) {
    return (await lstat(path).catch(() => null)) !== null;
}
