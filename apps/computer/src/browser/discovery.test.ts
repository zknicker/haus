import { expect, test } from 'bun:test';
import { chromeUserDataDir, existingBrowserCandidates } from './discovery.ts';
import type { ProcessRecord } from './types.ts';

const application = {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path: '/Applications/Google Chrome.app',
    version: '153',
};
const record = (profile: string, extra = ''): ProcessRecord => ({
    command: `${application.executablePath} --user-data-dir=${profile} --remote-debugging-port=0 ${extra}`,
    cpuPercent: 0,
    elapsedSeconds: 20,
    parentPid: 1,
    pid: 20,
    rssBytes: 100,
});

test('discovers externally owned automation browsers without offering Haus attachment profiles or helpers', () => {
    const browsers = existingBrowserCandidates({
        applications: [application],
        root: '/haus/servers/one/browser',
        processes: [
            record('/Users/test/Browser Data'),
            record('/haus/servers/two/browser/profiles/default'),
            record('/Users/test/Browser Data', '--type=renderer'),
            { ...record('/personal'), command: application.executablePath },
        ],
    });
    expect(browsers).toEqual([
        {
            applicationPath: application.path,
            version: application.version,
            name: 'Browser Data',
            userDataDir: '/Users/test/Browser Data',
        },
    ]);
});

test('profile matching preserves spaces and does not accept a relative directory', () => {
    expect(chromeUserDataDir('--user-data-dir="/Users/test/Browser Data" --no-first-run')).toBe(
        '/Users/test/Browser Data'
    );
    expect(chromeUserDataDir('--user-data-dir=relative --no-first-run')).toBeNull();
});

test('arbitrary profile directories and parent processes use the same discovery rules', () => {
    const first = record('/Users/alex/Automation/team');
    const second = { ...record('/Volumes/Work/QA/team'), pid: 21, parentPid: 999 };
    const browsers = existingBrowserCandidates({
        applications: [application],
        root: '/haus/servers/one/browser',
        processes: [
            first,
            second,
            {
                ...record('/unused'),
                pid: 999,
                command: '/usr/bin/python3 /opt/services/custom-browser.py',
            },
        ],
    });
    expect(browsers).toEqual([
        {
            applicationPath: application.path,
            version: application.version,
            name: 'team',
            userDataDir: '/Users/alex/Automation/team',
        },
        {
            applicationPath: application.path,
            version: application.version,
            name: 'team',
            userDataDir: '/Volumes/Work/QA/team',
        },
    ]);
});
