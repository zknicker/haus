import { expect, test } from 'bun:test';
import { badgeVariants } from '@heroui/styles';
import { renderToStaticMarkup } from 'react-dom/server';
import { availabilityLabel } from '../computers/presentation.ts';
import { AgentAvatar, availabilityBadgeColor } from './agent-avatar.tsx';

test('DM status copy uses concise global availability labels', () => {
    expect(availabilityLabel({ availability: 'idle' })).toBe('Online');
    expect(availabilityLabel({ availability: 'working' })).toBe('Working');
    expect(availabilityLabel({ availability: 'offline' })).toBe('Offline');
    expect(availabilityLabel({ availability: 'stopped' })).toBe('Stopped');
    expect(availabilityLabel({ availability: 'error' })).toBe('Needs attention');
    expect(
        availabilityLabel({
            availability: 'error',
            wakePause: {
                failureCount: 3,
                lastFailure: { at: '2026-10-06T11:00:00.000Z', code: null, kind: 'unknown' },
                nextProbeAt: null,
                pausedAt: '2026-10-06T11:00:00.000Z',
            },
        })
    ).toBe('Paused');
});

test('availability maps onto HeroUI Badge colors', () => {
    expect(availabilityBadgeColor('idle')).toBe('success');
    expect(availabilityBadgeColor('working')).toBe('warning');
    expect(availabilityBadgeColor('error')).toBe('danger');
    expect(availabilityBadgeColor('offline')).toBe('default');
});

test('HeroUI Badge variants remain isolated between Agent instances', () => {
    const idleBadge = badgeVariants({ color: 'success', placement: 'bottom-right', size: 'sm' });
    const workingBadge = badgeVariants({ color: 'warning', placement: 'bottom-right', size: 'sm' });

    expect(idleBadge).not.toBe(workingBadge);
    expect(idleBadge.base()).toContain('badge--success');
    expect(idleBadge.base()).not.toContain('badge--warning');
    expect(workingBadge.base()).toContain('badge--warning');
});

test('AgentAvatar renders the required availability with the matching badge color', () => {
    const markup = renderToStaticMarkup(
        AgentAvatar({
            agent: {
                availability: 'idle',
                avatarUrl: null,
                displayName: 'Blippy',
                id: 'agt_blippy',
            },
            size: 24,
        })
    );

    expect(markup).toContain('data-agent-status="idle"');
    expect(markup).toContain('badge--success');
    expect(markup).not.toContain('badge--warning');
    expect(markup).not.toContain('data-agent-status="unknown"');
});

test('offline AgentAvatar uses the stronger muted fill on every surface', () => {
    const markup = renderToStaticMarkup(
        AgentAvatar({
            agent: {
                availability: 'offline',
                avatarUrl: null,
                displayName: 'Blippy',
                id: 'agt_blippy',
            },
            size: 24,
        })
    );

    expect(markup).toContain('data-agent-status="offline"');
    expect(markup).toContain('badge--default');
    expect(markup).toContain('bg-muted');
});
