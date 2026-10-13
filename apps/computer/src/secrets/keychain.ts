import { homedir } from 'node:os';
import { join } from 'node:path';

/** Keychain service for every Computer Secrets token; the account is the Server attachment id. */
export const secretsKeychainService = 'haus.computer.1password';

const securityPath = '/usr/bin/security';

/**
 * Where the token lives: one macOS login Keychain item per Server attachment.
 * The path is explicit because Agent processes run with their own HOME, and
 * `security` resolves the default keychain list from HOME.
 */
export interface SecretsKeychain {
    delete(account: string): Promise<void>;
    path: string;
    read(account: string): Promise<string | null>;
    write(account: string, token: string): Promise<void>;
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
        async read(account: string) {
            const result = await run([
                'find-generic-password',
                '-s',
                secretsKeychainService,
                '-a',
                account,
                '-w',
                path,
            ]);
            if (result.exitCode === 44) {
                return null;
            }
            if (result.exitCode !== 0) {
                throw new Error('Could not read the 1Password token from the macOS Keychain.');
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
            if (result.exitCode !== 0 && result.exitCode !== 44) {
                throw new Error('Could not remove the 1Password token from the macOS Keychain.');
            }
        },
    } satisfies SecretsKeychain;
}

async function run(args: string[], options: { stdin?: string } = {}) {
    const child = Bun.spawn([securityPath, ...args], {
        stderr: 'ignore',
        stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
        stdout: 'pipe',
    });
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return { exitCode, stdout };
}

function quote(value: string) {
    return `"${value.replaceAll('"', '\\"')}"`;
}
