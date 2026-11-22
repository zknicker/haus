import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    detectComputerUseReadiness,
    macosVersionOf,
    readPermissions,
} from './desktop-readiness.ts';

describe('computer use readiness', () => {
    test('a Computer off macOS reports nothing', async () => {
        expect(
            await detectComputerUseReadiness({ dataRoot: '/no-data', platform: 'linux' })
        ).toBeUndefined();
    });

    test('the macOS version is reported only as a plain dotted version', () => {
        expect(macosVersionOf('27.3\n')).toBe('27.3');
        expect(macosVersionOf('26.1.2')).toBe('26.1.2');
        expect(macosVersionOf('27.3 beta')).toBeUndefined();
        expect(macosVersionOf('')).toBeUndefined();
    });

    test.if(process.platform === 'darwin')('this Mac reports its macOS version', async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-readiness-'));
        try {
            const readiness = await detectComputerUseReadiness({ dataRoot });
            expect(readiness?.macosVersion).toMatch(/^\d+(\.\d+){0,2}$/u);
            expect(readiness?.appPath).toBeUndefined();
        } finally {
            await rm(dataRoot, { force: true, recursive: true });
        }
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
});
