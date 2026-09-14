import { expect, test } from 'bun:test';
import { AppleIcon, ComputerIcon, WindowsNewIcon } from '@hugeicons-pro/core-solid-rounded';
import {
    agentExecutionLabels,
    computerHealthColor,
    computerLabel,
    computerPlatformIcon,
    computerRuntimePresentations,
    computerSystemLabel,
} from './presentation.ts';

const inventory = {
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
        },
    ],
};

test('presents Computer and execution ids as customer-facing labels', () => {
    const computer = {
        architecture: 'arm64',
        id: 'cmp_12345678',
        name: "Zach's MacBook Pro",
        operatingSystem: 'darwin',
    };

    expect(computerLabel(computer)).toBe("Zach's MacBook Pro");
    expect(computerSystemLabel(computer)).toBe('Mac · Apple Silicon');
    expect(
        agentExecutionLabels(
            { desiredModelId: 'gpt-5.6-sol', desiredRuntimeId: 'codex' },
            inventory
        )
    ).toEqual({
        model: 'GPT-5.6 Sol',
        modelAvailable: true,
        runtime: 'Codex',
        runtimeAvailable: true,
    });
});

test('Computer health maps onto HeroUI status colors', () => {
    expect(computerHealthColor('healthy')).toBe('success');
    expect(computerHealthColor('offline')).toBe('default');
    expect(computerHealthColor('degraded')).toBe('warning');
    expect(computerHealthColor('update-required')).toBe('warning');
});

test('uses a neutral platform label before a Computer reports its name', () => {
    expect(
        computerLabel({
            architecture: null,
            id: 'cmp_12345678',
            name: null,
            operatingSystem: 'darwin',
        })
    ).toBe('Mac Computer');
});

test('does not silently substitute another runtime or model', () => {
    expect(
        agentExecutionLabels(
            { desiredModelId: 'missing-model', desiredRuntimeId: 'missing-runtime' },
            inventory
        )
    ).toEqual({
        model: 'missing-model',
        modelAvailable: false,
        runtime: 'missing-runtime',
        runtimeAvailable: false,
    });
});

test('tolerates an inventory payload without runtimes', () => {
    const malformed = {} as Parameters<typeof computerRuntimePresentations>[0];
    const runtimes = computerRuntimePresentations(malformed);
    expect(runtimes.length).toBeGreaterThan(0);
    expect(runtimes.every((runtime) => runtime.detected === false)).toBe(true);
    expect(
        agentExecutionLabels(
            { desiredModelId: 'model-x', desiredRuntimeId: 'runtime-y' },
            malformed
        )
    ).toEqual({
        model: 'model-x',
        modelAvailable: false,
        runtime: 'runtime-y',
        runtimeAvailable: false,
    });
});

test('presents every supported runtime and preserves newly reported runtimes', () => {
    expect(
        computerRuntimePresentations({
            runtimes: [
                inventory.runtimes[0],
                {
                    id: 'future-runtime',
                    label: 'Future Runtime',
                    models: [],
                },
            ],
        }).map(({ detected, id, label }) => ({ detected, id, label }))
    ).toEqual([
        { detected: true, id: 'codex', label: 'Codex' },
        { detected: false, id: 'claude-code', label: 'Claude Code' },
        { detected: false, id: 'grok-build', label: 'Grok Build' },
        { detected: false, id: 'pi', label: 'Pi' },
        { detected: true, id: 'future-runtime', label: 'Future Runtime' },
    ]);
});

test('marks a Computer with its platform logo, and unknown platforms with a machine', () => {
    expect(computerPlatformIcon({ operatingSystem: 'darwin' })).toBe(AppleIcon);
    expect(computerPlatformIcon({ operatingSystem: 'win32' })).toBe(WindowsNewIcon);
    expect(computerPlatformIcon({ operatingSystem: 'Windows' })).toBe(WindowsNewIcon);
    // No penguin exists in the icon set, so Linux shares the generic machine
    // glyph with platforms we have never seen and with a Computer that has not
    // reported yet — rather than borrowing another vendor's mark.
    expect(computerPlatformIcon({ operatingSystem: 'linux' })).toBe(ComputerIcon);
    expect(computerPlatformIcon({ operatingSystem: 'plan9' })).toBe(ComputerIcon);
    expect(computerPlatformIcon({ operatingSystem: null })).toBe(ComputerIcon);
});
