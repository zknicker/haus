import { expect, test } from 'bun:test';
import {
    computerUseReadinessIssues,
    computerUseReadinessText,
    supportsComputerUse,
} from './computer-use-model.ts';

const ready = {
    accessibility: 'granted',
    installed: true,
    screenRecording: 'granted',
    version: '0.4.0',
} as const;

const texts = (readiness: Parameters<typeof computerUseReadinessIssues>[0]) =>
    computerUseReadinessIssues(readiness).map(computerUseReadinessText);

test('a ready Device and an older Computer that reports no readiness show nothing', () => {
    expect(texts(ready)).toEqual([]);
    expect(texts(undefined)).toEqual([]);
});

test('a missing agent-desktop asks for the install alone', () => {
    expect(
        texts({ ...ready, accessibility: 'unknown', installed: false, screenRecording: 'unknown' })
    ).toEqual(['Install agent-desktop on this Device:']);
});

test('each permission not granted names its System Settings pane or asks for a recheck', () => {
    expect(texts({ ...ready, accessibility: 'denied', screenRecording: 'unknown' })).toEqual([
        'Allow Haus Computer in System Settings → Privacy & Security → Accessibility.',
        'Haus couldn’t read the Screen Recording permission; Refresh to check again.',
    ]);
});

test('computer use is offered on macOS Devices only', () => {
    expect(supportsComputerUse({ operatingSystem: 'darwin' })).toBe(true);
    expect(supportsComputerUse({ operatingSystem: 'linux' })).toBe(false);
    expect(supportsComputerUse({ operatingSystem: null })).toBe(false);
});
