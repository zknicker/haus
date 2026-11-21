import { expect, test } from 'bun:test';
import { residentExecutable } from './desktop/permission-holder.ts';
import { launchdPlist } from './resident-service.ts';

test('the resident service keeps its state root outside executable code', () => {
    const plist = launchdPlist(
        { args: ['/opt/haus/package/index.ts'], executable: '/opt/haus/bin/bun' },
        '/Users/me/.haus/computer'
    );
    expect(plist).toContain('<string>com.haus.computer</string>');
    expect(plist).toContain('<key>HAUS_COMPUTER_DATA_ROOT</key>');
    expect(plist).toContain('.haus/computer');
    expect(plist).toContain('<key>StandardOutPath</key>');
    expect(plist).toContain('.haus/computer/logs/computer.log');
    expect(plist).toContain('<key>PATH</key>');
    expect(plist).toContain('/opt/homebrew/bin');
    expect(plist).toContain('/usr/local/bin');
    expect(plist).toContain('/.local/bin');
    expect(plist).not.toContain('/opt/haus/package/.haus');
    expect(plist).not.toContain('AssociatedBundleIdentifiers');
});

test('the bundled resident service names its app and runs the bundle executable', () => {
    const executable =
        '/Users/me/.local/share/haus-computer/Haus Computer.app/Contents/MacOS/haus-computer';
    const plist = launchdPlist(
        { args: [], executable },
        '/Users/me/.haus/computer',
        'chat.haus.computer'
    );
    expect(plist).toContain(
        '<key>AssociatedBundleIdentifiers</key><array><string>chat.haus.computer</string></array>'
    );
    expect(residentExecutable(plist)).toBe(executable);
});
