import { expect, test } from 'bun:test';
import type { ComputerUpdateProgress } from './update-contract.ts';
import { createUpgradeRenderer, describeConcurrentUpdate } from './upgrade-render.ts';

const ESC = String.fromCharCode(27);

test('a TTY renders a determinate byte bar and finalizes each phase line', () => {
    const { output, renderer } = capturingRenderer(true);
    renderer.observe(at('requested'));
    renderer.observe(at('downloading', { downloadedBytes: 12_400_000, totalBytes: 48_200_000 }));
    renderer.observe(at('downloading', { downloadedBytes: 48_200_000, totalBytes: 48_200_000 }));
    renderer.observe(at('verifying'));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 2 }));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 1 }));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 0 }));
    renderer.observe(at('installing'));
    renderer.observe(at('restarting'));
    renderer.finish();
    const joined = output.join('');
    expect(joined).toContain(`\r${ESC}[2K`);
    expect(joined).toContain('25%');
    expect(joined).toContain('12.4 MB / 48.2 MB');
    expect(joined).toContain('100%');
    expect(joined).toContain('█'.repeat(24));
    expect(joined).toContain('Waiting for 2 active Agents to finish…');
    expect(joined).toContain('Waiting for 1 active Agent to finish…');
    expect(joined).toContain('Installing Haus Computer 1.1.0…');
    expect(joined).toContain('Restarting Haus Computer…');
    // One newline per finished phase: requested, downloading, verifying,
    // waiting-for-agents, installing, and restarting (closed by finish()).
    expect(joined.split('\n').length - 1).toBe(6);
    expect(joined.endsWith('\n')).toBe(true);
});

test('an unknown download size never renders a bar or percentage', () => {
    const { output, renderer } = capturingRenderer(true);
    renderer.observe(at('downloading', { downloadedBytes: 12_400_000, totalBytes: null }));
    renderer.finish();
    const joined = output.join('');
    expect(joined).toContain('12.4 MB');
    expect(joined).not.toContain('%');
    expect(joined).not.toContain('█');
    expect(joined).not.toContain('░');
});

test('a non-TTY stream gets sparse plain lines with no ANSI or carriage returns', () => {
    const { output, renderer } = capturingRenderer(false);
    renderer.observe(at('requested'));
    renderer.observe(at('downloading', { downloadedBytes: 1_000_000, totalBytes: 48_200_000 }));
    renderer.observe(at('downloading', { downloadedBytes: 24_000_000, totalBytes: 48_200_000 }));
    renderer.observe(at('downloading', { downloadedBytes: 48_200_000, totalBytes: 48_200_000 }));
    renderer.observe(at('verifying'));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 2 }));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 2 }));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 1 }));
    renderer.observe(at('waiting-for-agents', { activeAgentCount: 0 }));
    renderer.observe(at('installing'));
    renderer.observe(at('restarting'));
    renderer.finish();
    const joined = output.join('');
    expect(joined).not.toContain('\r');
    expect(joined).not.toContain(ESC);
    expect(joined.split('\n').slice(0, -1)).toEqual([
        'Update requested: Haus Computer 1.1.0.',
        'Downloading Haus Computer 1.1.0 (48.2 MB)…',
        'Verifying signature and integrity…',
        'Waiting for 2 active Agents to finish…',
        'Waiting for 1 active Agent to finish…',
        'Waiting for active Agents to finish…',
        'Installing Haus Computer 1.1.0…',
        'Restarting Haus Computer…',
    ]);
});

test('a failure finalizes the live line and names the failed step', () => {
    const { output, renderer } = capturingRenderer(true);
    renderer.observe(at('downloading', { downloadedBytes: 1_000_000, totalBytes: 48_200_000 }));
    renderer.observe({
        ...at('failed'),
        detail: 'Computer release download failed (503).',
        failedPhase: 'downloading',
    });
    renderer.finish();
    const joined = output.join('');
    expect(joined).toContain('Update failed while downloading the release.\n');
    // The pending download line is closed before the failure line prints.
    expect(joined).toMatch(/48\.2 MB\nUpdate failed/u);
});

test('a concurrent update reports its live state', () => {
    expect(
        describeConcurrentUpdate(
            at('downloading', { downloadedBytes: 12_400_000, totalBytes: 48_200_000 })
        )
    ).toBe(
        'Another Haus Computer update to 1.1.0 is already in progress (downloading, 12.4 MB of 48.2 MB). Re-run haus-computer upgrade to check on it.'
    );
    expect(describeConcurrentUpdate(at('waiting-for-agents', { activeAgentCount: 1 }))).toContain(
        'waiting for 1 active Agent'
    );
    expect(describeConcurrentUpdate(at('installing'))).toContain('(installing)');
});

function capturingRenderer(isTTY: boolean) {
    const output: string[] = [];
    const renderer = createUpgradeRenderer({
        isTTY,
        write: (text) => {
            output.push(text);
        },
    });
    return { output, renderer };
}

function at(
    phase: ComputerUpdateProgress['phase'],
    fields: Partial<ComputerUpdateProgress> = {}
): ComputerUpdateProgress {
    return {
        activeAgentCount: null,
        detail: null,
        downloadedBytes: null,
        failedPhase: null,
        phase,
        targetVersion: '1.1.0',
        totalBytes: null,
        updatedAt: '2026-08-10T12:00:00.000Z',
        ...fields,
    };
}
