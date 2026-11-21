import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectComputerUseReadiness, readPermissions, readVersion } from './desktop-readiness.ts';

describe('computer use readiness', () => {
    test('a Computer off macOS reports nothing', async () => {
        expect(await detectComputerUseReadiness({ platform: 'linux' })).toBeUndefined();
    });

    test('a Mac without agent-desktop reports it missing', async () => {
        const empty = await mkdtemp(join(tmpdir(), 'haus-desktop-'));
        expect(await detectComputerUseReadiness({ platform: 'darwin', searchPath: empty })).toEqual(
            {
                accessibility: 'unknown',
                installed: false,
                screenRecording: 'unknown',
                version: null,
            }
        );
    });

    test('permission states map from the agent-desktop envelope', () => {
        expect(
            readPermissions({
                command: 'permissions',
                data: {
                    accessibility: { state: 'granted' },
                    automation: { state: 'not_determined' },
                    screen_recording: { state: 'denied' },
                },
                ok: true,
            })
        ).toEqual({ accessibility: 'granted', screenRecording: 'denied' });
        expect(readPermissions({ data: { accessibility: { state: 'not_determined' } } })).toEqual({
            accessibility: 'unknown',
            screenRecording: 'unknown',
        });
        expect(readPermissions(undefined)).toEqual({
            accessibility: 'unknown',
            screenRecording: 'unknown',
        });
    });

    test('the version comes from the envelope data', () => {
        expect(readVersion({ data: { version: '1.3.1' }, ok: true })).toBe('1.3.1');
        expect(readVersion({ data: {} })).toBeNull();
    });
});
