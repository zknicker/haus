import { describe, expect, test } from 'bun:test';
import {
    computerAttachmentDaemonEntrypoint,
    computerEntrypoint,
    isStandaloneComputer,
} from './build-identity.ts';

describe('computerAttachmentDaemonEntrypoint', () => {
    test('watches the Server attachment daemon in development', () => {
        const entrypoint = computerEntrypoint();

        expect(computerAttachmentDaemonEntrypoint('srv_dev', { watch: true })).toEqual({
            args: ['--watch', ...entrypoint.args, '__attachment-daemon', 'srv_dev'],
            executable: entrypoint.executable,
        });
    });

    test('keeps production Server attachment daemons stable', () => {
        const entrypoint = computerEntrypoint();

        expect(computerAttachmentDaemonEntrypoint('srv_prod', { watch: false })).toEqual({
            args: [...entrypoint.args, '__attachment-daemon', 'srv_prod'],
            executable: entrypoint.executable,
        });
    });
});

describe('isStandaloneComputer', () => {
    test('a compiled binary is standalone even without the release build flag', () => {
        expect(isStandaloneComputer(undefined, 'file:///$bunfs/root/haus-computer')).toBe(true);
        expect(isStandaloneComputer('1', 'file:///repo/apps/computer/src/build-identity.ts')).toBe(
            true
        );
    });

    test('a source checkout run by Bun is not standalone', () => {
        expect(
            isStandaloneComputer(undefined, 'file:///repo/apps/computer/src/build-identity.ts')
        ).toBe(false);
    });
});
