import { homedir } from 'node:os';
import { join } from 'node:path';

/** Keychain service for every Computer Secrets token; the account is the Server attachment id. */
export const secretsKeychainService = 'haus.computer.1password';

export const securityPath = '/usr/bin/security';

/** `security` exits with the low byte of the OSStatus; 44 is errSecItemNotFound. */
export const keychainItemNotFoundExitCode = 44;

/**
 * Whether the token can be read right now. Any failure other than "not found"
 * means the Keychain refused the read, which on a headless Computer is the
 * login Keychain locking itself after its idle timeout.
 */
export type KeychainTokenState = 'locked' | 'missing' | 'present';

/**
 * Where the token lives: one macOS login Keychain item per Server attachment.
 * The path is explicit because Agent processes run with their own HOME, and
 * `security` resolves the default keychain list from HOME.
 */
export interface SecretsKeychain {
    delete(account: string): Promise<void>;
    path: string;
    probe(account: string): Promise<KeychainTokenState>;
    read(account: string): Promise<string | null>;
    write(account: string, token: string): Promise<void>;
}

export class KeychainLockedError extends Error {
    constructor() {
        super("This Computer's Keychain is locked. Log in on the Computer to unlock it.");
        this.name = 'KeychainLockedError';
    }
}

export function loginKeychain(path = join(homedir(), 'Library/Keychains/login.keychain-db')) {
    return {
        path,
        async write(account: string, token: string) {
            // `security -i` reads the command from stdin, so the token never
            // appears in this process's argv (visible to `ps`). Both values are
            // word-split there, so they must be plain tokens.
            if (!(/^[A-Za-z0-9_-]+$/.test(account) && /^ops_[A-Za-z0-9+/=_-]+$/.test(token))) {
                throw new Error('Refusing to store a malformed 1Password token.');
            }
            const result = await run(['-i'], {
                stdin: `add-generic-password -U -s ${secretsKeychainService} -a ${account} -w ${token} ${quote(path)}\n`,
            });
            if (result.exitCode !== 0) {
                throw new Error('Could not save the 1Password token to the macOS Keychain.');
            }
        },
        async probe(account: string) {
            // Same read `haus-secrets` makes, so the report matches what Agents
            // hit; the value is discarded unread.
            const result = await run(findTokenArgs(account, path), { stdout: 'ignore' });
            return tokenState(result.exitCode);
        },
        async read(account: string) {
            const result = await run(findTokenArgs(account, path));
            const state = tokenState(result.exitCode);
            if (state === 'missing') {
                return null;
            }
            if (state === 'locked') {
                throw new KeychainLockedError();
            }
            return result.stdout.trim() || null;
        },
        async delete(account: string) {
            const result = await run([
                'delete-generic-password',
                '-s',
                secretsKeychainService,
                '-a',
                account,
                path,
            ]);
            if (result.exitCode !== 0 && result.exitCode !== keychainItemNotFoundExitCode) {
                throw new Error('Could not remove the 1Password token from the macOS Keychain.');
            }
        },
    } satisfies SecretsKeychain;
}

export function tokenState(exitCode: number): KeychainTokenState {
    if (exitCode === 0) {
        return 'present';
    }
    return exitCode === keychainItemNotFoundExitCode ? 'missing' : 'locked';
}

function findTokenArgs(account: string, path: string) {
    return ['find-generic-password', '-s', secretsKeychainService, '-a', account, '-w', path];
}

async function run(args: string[], options: { stdin?: string; stdout?: 'ignore' } = {}) {
    const child = Bun.spawn([securityPath, ...args], {
        stderr: 'ignore',
        stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
        stdout: options.stdout ?? 'pipe',
    });
    const [stdout, exitCode] = await Promise.all([
        child.stdout ? new Response(child.stdout).text() : Promise.resolve(''),
        child.exited,
    ]);
    return { exitCode, stdout };
}

function quote(value: string) {
    return `"${value.replaceAll('"', '\\"')}"`;
}
