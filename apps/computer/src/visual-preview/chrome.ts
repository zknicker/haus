import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDevToolsActivePort } from '../browser/cdp-probe.ts';
import { detectChromeApplications } from '../browser/chrome-detection.ts';
import { type CdpClient, connectCdp } from './cdp.ts';

/** A throwaway headless Chrome. `close` kills it and removes its profile. */
export interface HeadlessChrome {
    cdp: CdpClient;
    close(): Promise<void>;
}

/** Infra failure the CLI reports as-is: Chrome is missing or would not start. */
export class VisualPreviewChromeError extends Error {
    constructor(
        message: string,
        readonly fix: string
    ) {
        super(message);
        this.name = 'VisualPreviewChromeError';
    }
}

/** The process seam, so cleanup is testable without a real browser. */
export interface ChromeProcessDeps {
    connect(url: string): Promise<CdpClient>;
    /** How long `close` waits for each signal to land; tests shorten it. */
    exitGraceMs?: number;
    readActivePort(userDataDir: string): { port: number; webSocketPath: string } | null;
    spawn(
        executablePath: string,
        args: string[]
    ): { exited: Promise<number>; kill(signal?: NodeJS.Signals): void };
}

const startupTimeoutMs = 10_000;
const defaultExitGraceMs = 3000;
const exitSignals: NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];

/** System Google Chrome, or a clear error naming the fix. */
export async function findChromeExecutable(): Promise<string> {
    const [application] = await detectChromeApplications();
    if (!application) {
        throw new VisualPreviewChromeError(
            'Google Chrome was not found.',
            process.platform === 'darwin'
                ? 'Install Google Chrome in /Applications (or ~/Applications), then run the preview again.'
                : 'Visual preview needs Google Chrome on macOS.'
        );
    }
    return application.executablePath;
}

/**
 * Launch Chrome headless on a fresh temp profile. Agent HTML is untrusted, so
 * this never touches the operator's configured browser profile
 * (`browser/service.ts`): every launch gets its own empty user-data dir, which
 * `close` deletes along with the process.
 */
export async function launchHeadlessChrome(
    executablePath: string,
    deps: ChromeProcessDeps = systemChromeDeps
): Promise<HeadlessChrome> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-visual-preview-'));
    const child = deps.spawn(executablePath, chromeArgs(userDataDir));
    let cdp: CdpClient | null = null;
    // A cancelled turn signals the CLI mid-render: take Chrome and its profile
    // down synchronously before exiting, since no `finally` will run.
    const onSignal = (signal: NodeJS.Signals) => {
        child.kill('SIGKILL');
        removeProfile(userDataDir);
        process.exit(128 + (os.constants.signals[signal] ?? 1));
    };
    for (const signal of exitSignals) {
        process.once(signal, onSignal);
    }
    const graceMs = deps.exitGraceMs ?? defaultExitGraceMs;
    const close = async () => {
        for (const signal of exitSignals) {
            process.off(signal, onSignal);
        }
        cdp?.close();
        child.kill();
        const exited = await Promise.race([
            child.exited.then(() => true),
            Bun.sleep(graceMs).then(() => false),
        ]);
        if (!exited) {
            child.kill('SIGKILL');
            await Promise.race([child.exited, Bun.sleep(graceMs)]);
        }
        removeProfile(userDataDir);
    };
    try {
        const active = await waitForActivePort(userDataDir, deps, child.exited);
        cdp = await deps.connect(`ws://127.0.0.1:${active.port}${active.webSocketPath}`);
        return { cdp, close };
    } catch (error) {
        await close();
        throw error instanceof VisualPreviewChromeError
            ? error
            : new VisualPreviewChromeError(
                  `Headless Chrome did not start: ${error instanceof Error ? error.message : String(error)}`,
                  'Quit any Chrome update in progress and try again.'
              );
    }
}

export function chromeArgs(userDataDir: string): string[] {
    return [
        '--headless=new',
        `--user-data-dir=${userDataDir}`,
        '--remote-debugging-port=0',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-default-apps',
        '--mute-audio',
        // Never touch the macOS Keychain: agent shells run with a sandboxed HOME,
        // so real Chrome finds no login keychain and raises a system dialog.
        '--use-mock-keychain',
        '--password-store=basic',
        // Pin the sandboxed frame to its own target so the renderer can attach
        // to it the same way on every Chrome build (render-frame.ts).
        '--enable-features=IsolateSandboxedIframes',
        '--hide-scrollbars',
        'about:blank',
    ];
}

async function waitForActivePort(
    userDataDir: string,
    deps: ChromeProcessDeps,
    exited: Promise<number>
): Promise<{ port: number; webSocketPath: string }> {
    let exitCode: number | null = null;
    exited.then((code) => {
        exitCode = code;
    });
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
        const active = deps.readActivePort(userDataDir);
        if (active) {
            return active;
        }
        if (exitCode !== null) {
            throw new Error(`Chrome exited with code ${exitCode}.`);
        }
        await Bun.sleep(50);
    }
    throw new Error('Chrome did not open a DevTools port within 10s.');
}

// Best effort: a profile Chrome is still flushing can refuse removal once, and
// a leftover temp dir must never mask the render result or the real error.
function removeProfile(userDataDir: string) {
    try {
        fs.rmSync(userDataDir, { force: true, maxRetries: 3, recursive: true });
    } catch {
        // The OS temp cleaner reclaims it.
    }
}

const systemChromeDeps: ChromeProcessDeps = {
    connect: connectCdp,
    readActivePort: readDevToolsActivePort,
    spawn(executablePath, args) {
        const child = Bun.spawn([executablePath, ...args], {
            stderr: 'ignore',
            stdin: 'ignore',
            stdout: 'ignore',
        });
        return { exited: child.exited, kill: (signal) => child.kill(signal) };
    },
};
