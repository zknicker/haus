import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { detectLinuxChromeApplications } from './linux-chrome-detection.ts';
import type { ChromeApplication } from './types.ts';

const execFileAsync = promisify(execFile);

const chromeExecutableRelativePath = 'Contents/MacOS/Google Chrome';

// macOS supports Google Chrome Stable at fixed bundle locations.
function chromeBundleCandidates(): string[] {
    return [
        '/Applications/Google Chrome.app',
        path.join(os.homedir(), 'Applications', 'Google Chrome.app'),
    ];
}

export async function detectChromeApplications(): Promise<ChromeApplication[]> {
    if (process.platform === 'linux') {
        return await detectLinuxChromeApplications();
    }
    if (process.platform !== 'darwin') {
        return [];
    }
    const applications: ChromeApplication[] = [];
    for (const bundlePath of chromeBundleCandidates()) {
        const executablePath = path.join(bundlePath, chromeExecutableRelativePath);
        if (!isExecutableFile(executablePath)) {
            continue;
        }
        applications.push({
            executablePath,
            path: bundlePath,
            version: await readChromeVersion(bundlePath),
        });
    }
    return applications;
}

function isExecutableFile(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

async function readChromeVersion(bundlePath: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync(
            '/usr/bin/defaults',
            ['read', path.join(bundlePath, 'Contents', 'Info'), 'CFBundleShortVersionString'],
            { timeout: 5000 }
        );
        const version = stdout.trim();
        return version.length > 0 ? version : null;
    } catch {
        return null;
    }
}
