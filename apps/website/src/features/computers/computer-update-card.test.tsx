import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComputerUpdateComputer } from './computer-update-card.tsx';
import { ComputerUpdateCard } from './computer-update-card.tsx';
import { computerUpdatePreviewStates, previewComputerUpdate } from './computer-update-preview.tsx';

const computer = {
    health: 'healthy',
    id: 'computer-1',
    updateActiveAgentCount: null,
    updateDetail: null,
    updateDownloadedBytes: null,
    updateFailedPhase: null,
    updatePhase: 'idle',
    updateTargetVersion: null,
    updateTotalBytes: null,
    updateUpdatedAt: new Date().toISOString(),
} as ComputerUpdateComputer;

test('keeps Software Update copy stable after a failed check', () => {
    const html = renderUpdateCard({
        ...computer,
        updateDetail: 'Production Haus Computer 1.4.4 does not satisfy protocol 10.',
        updateFailedPhase: 'checking',
        updatePhase: 'failed',
    });

    expect(html).toContain('Check for and install the latest production release.');
    expect(html).not.toContain('does not satisfy protocol');
    expect(html).not.toContain('Recover with');
});

test('uses the HeroUI progress bar for determinate and indeterminate update phases', () => {
    const determinate = renderUpdateCard({
        ...computer,
        updateDownloadedBytes: 42,
        updatePhase: 'downloading',
        updateTargetVersion: '1.5.0',
        updateTotalBytes: 100,
    });
    const indeterminate = renderUpdateCard({
        ...computer,
        updatePhase: 'verifying',
        updateTargetVersion: '1.5.0',
    });

    expect(determinate).toContain('Downloading Haus Computer');
    expect(determinate).toContain('aria-valuenow="42"');
    expect(determinate).toMatch(/item-card__action[\s\S]*progress-bar/);
    expect(indeterminate).toContain('Verifying signature and integrity');
    expect(indeterminate).not.toContain('aria-valuenow');
});

test('names the available release in the update action', () => {
    const html = renderUpdateCard({
        ...computer,
        updatePhase: 'available',
        updateTargetVersion: '1.0.3',
    });

    expect(html).toContain('Update to v1.0.3');
});

test('an offline update stops showing endless progress after its connection window', () => {
    const html = renderUpdateCard({
        ...computer,
        health: 'offline',
        updatePhase: 'restarting',
        updateTargetVersion: '1.5.0',
        updateUpdatedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(html).toContain('did not reconnect after installation');
    expect(html).toContain('Unconfirmed');
    expect(html).not.toContain('progress-bar');
});

test('a connected Computer that stops reporting no longer shows endless progress', () => {
    const html = renderUpdateCard({
        ...computer,
        updatePhase: 'restarting',
        updateTargetVersion: '1.5.0',
        updateUpdatedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(html).toContain('This Computer stopped reporting update progress.');
    expect(html).toContain('Update to v1.5.0');
    expect(html).not.toContain('progress-bar');
});

test('a connected Computer already on its target never reads as stalled', () => {
    const html = renderUpdateCard({
        ...computer,
        productVersion: '1.5.0',
        updatePhase: 'restarting',
        updateTargetVersion: '1.5.0',
        updateUpdatedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(html).not.toContain('stopped reporting');
});

test('the development preview covers every update phase and both progress modes', () => {
    const previewIds = computerUpdatePreviewStates.map((state) => state.id);

    expect(previewIds).toEqual([
        'live',
        'idle',
        'checking',
        'available',
        'requested',
        'downloading',
        'downloading-indeterminate',
        'verifying',
        'waiting-for-agents',
        'installing',
        'restarting',
        'complete',
        'failed',
        'offline',
        'update-required',
    ]);
    expect(previewComputerUpdate(computer, 'downloading')).toMatchObject({
        updateDownloadedBytes: 42,
        updatePhase: 'downloading',
        updateTotalBytes: 100,
    });
    expect(previewComputerUpdate(computer, 'downloading-indeterminate')).toMatchObject({
        updateDownloadedBytes: 42,
        updatePhase: 'downloading',
        updateTotalBytes: null,
    });
});

test('disables the Update button only while the sidebar run is active', () => {
    const available = {
        ...computer,
        updatePhase: 'available',
        updateTargetVersion: '1.0.3',
    } as ComputerUpdateComputer;
    const render = (isUpdateBlocked: boolean) =>
        renderToStaticMarkup(
            <ComputerUpdateCard
                computer={available}
                isChecking={false}
                isStarting={false}
                isUpdateBlocked={isUpdateBlocked}
                onCheck={() => undefined}
                onUpdate={() => undefined}
            />
        );

    expect(render(true)).toMatch(/<button[^>]*disabled[^>]*>[^<]*Update/u);
    expect(render(false)).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Update/u);
});

function renderUpdateCard(updateComputer: ComputerUpdateComputer) {
    return renderToStaticMarkup(
        <ComputerUpdateCard
            computer={updateComputer}
            isChecking={false}
            isStarting={false}
            onCheck={() => undefined}
            onUpdate={() => undefined}
        />
    );
}
