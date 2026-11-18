import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const websiteRoot = fileURLToPath(new URL('../', import.meta.url));

process.chdir(workspaceRoot);

if (existsSync(chromium.executablePath())) {
    console.log('[haus-e2e] Playwright Chromium already installed.');
} else {
    await runStep(
        'Install Playwright Chromium',
        process.execPath,
        ['x', 'playwright', 'install', 'chromium'],
        { cwd: websiteRoot }
    );
}

await runStep('Build Haus SDK', process.execPath, ['run', '--filter', '@haus/sdk', 'build'], {
    cwd: workspaceRoot,
});

function runStep(label: string, command: string, args: string[], options: { cwd?: string } = {}) {
    console.log(`[haus-e2e] ${label}...`);

    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: process.env,
            stdio: 'inherit',
        });

        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) {
                console.log(`[haus-e2e] ${label} complete.`);
                resolve();
                return;
            }

            reject(
                new Error(
                    `${label} failed (${signal ?? code ?? 'unknown'}): ${command} ${args.join(' ')}`
                )
            );
        });
    });
}
