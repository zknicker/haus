import type { HausUpdateView } from './haus-update-model.ts';

export function withWebsiteUpdate(view: HausUpdateView, available: boolean): HausUpdateView {
    if (!available) {
        return view;
    }
    const pending = {
        ...view,
        componentFacts: [
            ...view.componentFacts,
            {
                id: 'website',
                kind: 'website' as const,
                label: 'Website',
                currentVersion: null,
                targetVersion: null,
                detail: null,
                remedy: null,
                status: 'pending' as const,
            },
        ],
    };
    if (
        view.phase === 'updating' ||
        view.phase === 'available' ||
        view.phase === 'restart-required'
    ) {
        return pending;
    }
    if (
        view.steps.some((step) => step.kind === 'desktop-app' && step.phase === 'restart-required')
    ) {
        return {
            ...pending,
            phase: 'restart-required',
            primaryAction: { kind: 'restart', label: 'Restart' },
        };
    }
    return {
        ...pending,
        phase: 'reload-required',
        headline: 'Update available. Reload Haus.',
        detail: 'Reload to use the updated website.',
        primaryAction: { kind: 'reload', label: 'Reload' },
    };
}
