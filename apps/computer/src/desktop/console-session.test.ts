import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { consoleRefusal } from './console-session.ts';
import { displayAsleep } from './desktop-preflight.ts';
import { parsePlist } from './plist.ts';

const uid = 501;

function fixture(name: string) {
    return readFileSync(join(import.meta.dir, 'fixtures', `console-${name}.plist`), 'utf8');
}

describe('the screen preflight', () => {
    test('the logged-in user at an unlocked screen may be driven', () => {
        expect(consoleRefusal(fixture('ready'), uid)).toBeNull();
    });

    test('a locked screen refuses', () => {
        expect(consoleRefusal(fixture('locked'), uid)).toBe('locked');
        expect(
            consoleRefusal(
                fixture('ready').replace(
                    '<key>IOConsoleLocked</key>\n\t<false/>',
                    '<key>IOConsoleLocked</key>\n\t<true/>'
                ),
                uid
            )
        ).toBe('locked');
    });

    test('another user on the console refuses as switched out', () => {
        expect(consoleRefusal(fixture('switched-out'), uid)).toBe('switched-out');
        expect(consoleRefusal(fixture('ready'), 502)).toBe('switched-out');
    });

    test('no logged-in console session refuses', () => {
        expect(consoleRefusal(fixture('no-session'), uid)).toBe('no-session');
        expect(
            consoleRefusal(
                fixture('ready').replace(
                    /<key>IOConsoleUsers<\/key>[\s\S]*?<\/array>/u,
                    '<key>IOConsoleUsers</key>\n\t<array/>'
                ),
                uid
            )
        ).toBe('no-session');
    });

    test('a malformed read fails instead of guessing', () => {
        expect(() => consoleRefusal('<plist><dict><key>IOConsoleUsers', uid)).toThrow();
        expect(() => consoleRefusal('not a plist', uid)).toThrow();
    });

    test('plist values decode entities and signed numbers', () => {
        const root = parsePlist(fixture('switched-out')) as {
            IOConsoleUsers: { kCGSessionLongUserNameKey: string }[];
            OSKernelCPUSubtype: number;
        };
        expect(root.IOConsoleUsers[1]?.kCGSessionLongUserNameKey).toBe('Guest & Friend');
        expect(root.OSKernelCPUSubtype).toBe(-1_073_741_822);
    });

    test.if(process.platform === 'darwin')('this Mac’s live ioreg output parses', () => {
        const live = execFileSync('/usr/sbin/ioreg', ['-n', 'Root', '-d1', '-a'], {
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
        });
        expect([null, 'locked', 'no-session', 'switched-out']).toContain(
            consoleRefusal(live, process.getuid?.() ?? -1)
        );
    });

    test('the display script reads asleep only from 1', () => {
        expect(displayAsleep('1\n')).toBe(true);
        expect(displayAsleep('0\n')).toBe(false);
        expect(displayAsleep('none\n')).toBe(false);
    });
});
