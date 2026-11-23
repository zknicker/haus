import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { expectedComputerRestartMs } from '../updates/haus-update-timing.ts';
import { type ComputerUpdateComputer, ComputerUpdateCard } from './computer-update-card.tsx';
import { computerUpdateView, showsComputerUpdateCard } from './computer-update-model.ts';
import { computerUpdateExpiry } from './use-update-expiry-refresh.ts';

const updatedAt = Date.parse('2026-11-23T12:00:00Z');
const checking = {
    health: 'healthy',
    id: 'cmp_devicestudio0000',
    productVersion: '1.0.0',
    updateActiveAgentCount: null,
    updateDetail: null,
    updateDownloadedBytes: null,
    updateFailedPhase: null,
    updatePhase: 'checking',
    updateTargetVersion: null,
    updateTotalBytes: null,
    updateUpdatedAt: new Date(updatedAt).toISOString(),
} as ComputerUpdateComputer;
const input = {
    health: checking.health,
    phase: checking.updatePhase,
    updateUpdatedAt: checking.updateUpdatedAt,
};

test('a hidden check carries the instant it stalls, where the section re-renders', () => {
    const stallsAt = updatedAt + expectedComputerRestartMs;

    expect(computerUpdateExpiry(checking)).toBe(stallsAt);
    expect(showsComputerUpdateCard({ ...input, observedAt: stallsAt - 1 })).toBe(false);
    expect(computerUpdateView({ ...input, observedAt: stallsAt - 1 }).canCheck).toBe(false);
    expect(showsComputerUpdateCard({ ...input, observedAt: stallsAt })).toBe(true);
    expect(computerUpdateView({ ...input, observedAt: stallsAt }).canCheck).toBe(true);
});

test('a check stuck past its bound shows the card with an enabled recovery action', () => {
    const html = renderToStaticMarkup(
        <ComputerUpdateCard
            computer={checking}
            isChecking={false}
            isStarting={false}
            onCheck={() => undefined}
            onUpdate={() => undefined}
        />
    );

    expect(html).toContain('Update stalled');
    expect(html).toContain('The update check did not finish.');
    expect(html).toMatch(/<button[^>]*>Update</u);
    expect(html).not.toMatch(/<button[^>]*disabled/u);
});
