import { describe, expect, test } from 'bun:test';
import { getUpdateStatusMessage } from './update-status.tsx';

describe('update settings status message', () => {
    test('hides idle status before the user checks for updates', () => {
        expect(
            getUpdateStatusMessage(
                {
                    phase: 'idle',
                },
                false
            )
        ).toBeNull();
    });

    test('shows a green up-to-date result after checking', () => {
        expect(
            getUpdateStatusMessage(
                {
                    phase: 'current',
                },
                true
            )
        ).toEqual({
            detail: 'Up to date',
            tone: 'success',
        });
    });

    test('shows an available update as an error-tone result', () => {
        expect(
            getUpdateStatusMessage(
                {
                    phase: 'available',
                    version: '1.2.4',
                },
                true
            )
        ).toEqual({
            detail: 'Haus v1.2.4 is available.',
            tone: 'neutral',
        });
    });
});
