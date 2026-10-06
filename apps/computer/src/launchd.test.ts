import { expect, test } from 'bun:test';
import { replaceLaunchdService, restartLaunchdService, runsInsideLaunchdJob } from './launchd.ts';

const service = {
    domain: 'gui/501',
    label: 'com.haus.computer',
    plistPath: '/Users/test/Library/LaunchAgents/com.haus.computer.plist',
};

test('bootstraps when bootout reports an absent service', () => {
    const calls: string[][] = [];
    const exitCodes = [5, 113, 0];

    replaceLaunchdService({
        ...service,
        run(args) {
            calls.push(args);
            return exitCodes.shift() ?? 1;
        },
    });

    expect(calls).toEqual([
        ['bootout', service.domain, service.plistPath],
        ['print', `${service.domain}/${service.label}`],
        ['bootstrap', service.domain, service.plistPath],
    ]);
});

test('fails closed when bootout leaves the service loaded', () => {
    const calls: string[][] = [];
    const exitCodes = [5, 0];

    expect(() =>
        replaceLaunchdService({
            ...service,
            run(args) {
                calls.push(args);
                return exitCodes.shift() ?? 1;
            },
        })
    ).toThrow('Could not replace Haus Computer service.');
    expect(calls).toEqual([
        ['bootout', service.domain, service.plistPath],
        ['print', `${service.domain}/${service.label}`],
    ]);
});

test('an in-job restart kickstarts the job and never boots it out', () => {
    const calls: string[][] = [];

    restartLaunchdService({
        ...service,
        insideJob: true,
        run(args) {
            calls.push(args);
            return 0;
        },
    });

    expect(calls).toEqual([['kickstart', '-k', `${service.domain}/${service.label}`]]);
});

test('an in-job restart reports a failed kickstart', () => {
    expect(() => restartLaunchdService({ ...service, insideJob: true, run: () => 113 })).toThrow(
        'Could not restart Haus Computer service.'
    );
});

test('a restart from outside the job reloads the service definition', () => {
    const calls: string[][] = [];

    restartLaunchdService({
        ...service,
        insideJob: false,
        run(args) {
            calls.push(args);
            return 0;
        },
    });

    expect(calls).toEqual([
        ['bootout', service.domain, service.plistPath],
        ['bootstrap', service.domain, service.plistPath],
    ]);
});

test('only processes launchd started for the job count as inside it', () => {
    expect(
        runsInsideLaunchdJob('com.haus.computer', { XPC_SERVICE_NAME: 'com.haus.computer' })
    ).toBe(true);
    expect(
        runsInsideLaunchdJob('com.haus.computer', {
            XPC_SERVICE_NAME: 'application.com.apple.Terminal',
        })
    ).toBe(false);
    expect(runsInsideLaunchdJob('com.haus.computer', {})).toBe(false);
});
