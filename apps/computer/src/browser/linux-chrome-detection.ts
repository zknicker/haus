import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import type { ChromeApplication } from './types.ts';

const execFileAsync = promisify(execFile);

const fixedBinaries = ['/opt/google/chrome/chrome'];
const commandNames = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];
const elfMagic = [0x7f, 0x45, 0x4c, 0x46];

export interface LinuxChromeHost {
    isElfExecutable(filePath: string): boolean;
    readVersion(executablePath: string): Promise<string | null>;
    realpath(filePath: string): string | null;
    which(command: string): string | null;
}

/**
 * Linux has no app bundle, so the saved application path is the ELF binary itself.
 * Wrapper scripts are skipped because the running browser process is the ELF.
 */
export async function detectLinuxChromeApplications(
    host: LinuxChromeHost = systemLinuxChromeHost
): Promise<ChromeApplication[]> {
    const candidates = [
        ...fixedBinaries,
        ...commandNames.flatMap((name) => host.which(name) ?? []),
    ];
    const binaries = new Set<string>();
    for (const candidate of candidates) {
        const resolved = host.realpath(candidate);
        if (resolved && host.isElfExecutable(resolved)) {
            binaries.add(resolved);
        }
    }
    return await Promise.all(
        [...binaries].map(async (executablePath) => ({
            executablePath,
            path: executablePath,
            version: await host.readVersion(executablePath),
        }))
    );
}

/** `Chromium 141.0.7390.37` and `Google Chrome 141.0.7390.37 ` both yield the number. */
export function parseChromeVersionOutput(output: string): string | null {
    return output.match(/\d+(?:\.\d+)+/u)?.[0] ?? null;
}

const systemLinuxChromeHost: LinuxChromeHost = {
    isElfExecutable(filePath) {
        try {
            fs.accessSync(filePath, fs.constants.X_OK);
            if (!fs.statSync(filePath).isFile()) {
                return false;
            }
            const header = Buffer.alloc(4);
            const fd = fs.openSync(filePath, 'r');
            try {
                fs.readSync(fd, header, 0, 4, 0);
            } finally {
                fs.closeSync(fd);
            }
            return elfMagic.every((byte, index) => header[index] === byte);
        } catch {
            return false;
        }
    },
    async readVersion(executablePath) {
        try {
            const { stdout } = await execFileAsync(executablePath, ['--version'], {
                timeout: 5000,
            });
            return parseChromeVersionOutput(stdout);
        } catch {
            return null;
        }
    },
    realpath(filePath) {
        try {
            return fs.realpathSync(filePath);
        } catch {
            return null;
        }
    },
    which(command) {
        return Bun.which(command);
    },
};
