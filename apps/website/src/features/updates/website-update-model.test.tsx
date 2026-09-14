import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateTooltipContent } from './haus-status-tooltip-content.tsx';
import { HausUpdateFooter } from './haus-update-footer.tsx';
import { type HausUpdateInput, projectHausUpdate } from './haus-update-model.ts';
import { withWebsiteUpdate } from './website-update-model.ts';

const input: HausUpdateInput = {
    computers: [],
    desktop: { kind: 'web' },
    release: {
        components: {
            agent: null,
            computer: '2.0.0',
            desktopApp: '2.0.0',
            ios: null,
            server: null,
        },
        sourceRevision: 'a'.repeat(40),
        version: '2.0.0',
    },
};

test('website alone uses the existing reload button and exact update copy', () => {
    const current = projectHausUpdate(input);
    expect(withWebsiteUpdate(current, false)).toBe(current);
    const view = withWebsiteUpdate(current, true);
    expect(view.primaryAction).toEqual({ kind: 'reload', label: 'Reload' });
    expect(view.steps).toEqual([]);
    expect(renderToStaticMarkup(<HausUpdateFooter view={view} />)).toContain(
        'aria-label="Update available. Reload Haus."'
    );
    const tooltip = renderToStaticMarkup(<UpdateTooltipContent view={view} />);
    expect(tooltip).toContain('Update available. Reload Haus.');
    expect(tooltip).toContain('Website');
});

test('Computer work precedes reload, including when it fails', () => {
    for (const [phase, expected] of [
        ['available', 'available'],
        ['downloading', 'updating'],
        ['failed', 'reload-required'],
        ['complete', 'reload-required'],
    ] as const) {
        const view = withWebsiteUpdate(
            projectHausUpdate({
                ...input,
                computers: [
                    {
                        id: 'home',
                        name: 'Home',
                        health: 'healthy',
                        lastConnectedAt: null,
                        currentVersion: phase === 'complete' ? '2.0.0' : '1.0.0',
                        phase,
                        reportedTargetVersion: '2.0.0',
                        detail: 'Connection failed',
                    },
                ],
            }),
            true
        );
        expect(view.phase).toBe(expected);
        if (phase === 'failed') {
            expect(renderToStaticMarkup(<UpdateTooltipContent view={view} />)).toContain(
                'Connection failed'
            );
        }
    }
});

test('desktop download and restart take precedence over website reload', () => {
    for (const [phase, expected] of [
        ['available', 'available'],
        ['downloading', 'updating'],
        ['ready', 'restart-required'],
    ] as const) {
        const view = withWebsiteUpdate(
            projectHausUpdate({
                ...input,
                desktop: { kind: 'desktop', currentVersion: '1.0.0', phase },
            }),
            true
        );
        expect(view.phase).toBe(expected);
    }
});

test('all three updates wait for Computer work before offering the desktop restart', () => {
    const desktop = { kind: 'desktop', currentVersion: '1.0.0', phase: 'ready' } as const;
    const computer = {
        id: 'home',
        name: 'Home',
        health: 'healthy',
        lastConnectedAt: null,
        currentVersion: '1.0.0',
        phase: 'downloading',
    } as const;
    const running = withWebsiteUpdate(
        projectHausUpdate({ ...input, desktop, computers: [computer] }),
        true
    );
    expect(running.phase).toBe('updating');
    const finished = projectHausUpdate({
        ...input,
        desktop,
        computers: [{ ...computer, currentVersion: '2.0.0', phase: 'complete' }],
    });
    expect(withWebsiteUpdate(finished, true).primaryAction?.kind).toBe('restart');
    expect(
        withWebsiteUpdate(
            {
                ...finished,
                phase: 'failed',
                primaryAction: { kind: 'retry', label: 'Try again' },
            },
            true
        ).primaryAction?.kind
    ).toBe('restart');
});
