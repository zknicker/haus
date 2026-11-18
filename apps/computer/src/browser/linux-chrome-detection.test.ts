import { expect, test } from 'bun:test';
import {
    detectLinuxChromeApplications,
    type LinuxChromeHost,
    parseChromeVersionOutput,
} from './linux-chrome-detection.ts';

const chromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

test('detects ELF Chrome binaries through PATH symlinks and skips wrapper scripts', async () => {
    const links: Record<string, string> = {
        '/usr/bin/chromium': chromium,
        '/usr/local/bin/google-chrome': '/usr/local/bin/google-chrome',
        '/usr/bin/chromium-browser': chromium,
    };
    const host: LinuxChromeHost = {
        isElfExecutable: (filePath) => filePath === chromium,
        readVersion: async () => '141.0.7390.37',
        realpath: (filePath) => links[filePath] ?? null,
        which: (command) =>
            Object.keys(links).find((filePath) => filePath.endsWith(`/${command}`)) ?? null,
    };
    expect(await detectLinuxChromeApplications(host)).toEqual([
        { executablePath: chromium, path: chromium, version: '141.0.7390.37' },
    ]);
});

test('reads the bare version from Chrome and Chromium version output', () => {
    expect(parseChromeVersionOutput('Chromium 141.0.7390.37 \n')).toBe('141.0.7390.37');
    expect(parseChromeVersionOutput('Google Chrome 142.0.7444.59')).toBe('142.0.7444.59');
    expect(parseChromeVersionOutput('')).toBeNull();
});
