import { describe, expect, test } from 'bun:test';
import { detectComputerUseReadiness, readPermissions } from './desktop-readiness.ts';

describe('computer use readiness', () => {
    test('a Computer off macOS reports nothing', async () => {
        expect(
            await detectComputerUseReadiness({ platform: 'linux', toolsRoot: '/no-tools' })
        ).toBeUndefined();
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
