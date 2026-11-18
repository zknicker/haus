import { describe, expect, test } from 'bun:test';
import { computerAttachmentDaemonEntrypoint, computerEntrypoint } from './build-identity.ts';

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
