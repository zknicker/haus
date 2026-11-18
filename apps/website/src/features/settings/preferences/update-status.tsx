import type { DesktopUpdateStatus } from '../../../hooks/desktop/use-desktop-update.ts';
import { cn } from '../../../lib/utils.ts';

/**
 * What the desktop updater is doing, as one line under the row that drives it.
 * Split from the row itself so the pure status mapping stays unit-testable.
 */
export function UpdateStatusMessage({
    detail,
    tone,
}: {
    detail: string;
    tone: 'error' | 'neutral' | 'success';
}) {
    return (
        <p
            className={cn(
                'mt-1 text-sm font-medium',
                tone === 'success' && 'text-success',
                tone === 'error' && 'text-danger',
                tone === 'neutral' && 'text-muted'
            )}
            role={tone === 'error' ? 'alert' : undefined}
        >
            {detail}
        </p>
    );
}

export function getUpdateStatusMessage(
    status: DesktopUpdateStatus,
    hasCheckedForUpdate: boolean
): null | {
    detail: string;
    tone: 'error' | 'neutral' | 'success';
} {
    switch (status.phase) {
        case 'current':
            return hasCheckedForUpdate ? { detail: 'Up to date', tone: 'success' } : null;
        case 'available':
        case 'ready':
            return {
                detail: `Haus v${status.version} is available.`,
                tone: 'neutral',
            };
        case 'error':
            return { detail: status.message, tone: 'error' };
        case 'checking':
        case 'unsupported':
            return hasCheckedForUpdate
                ? {
                      detail:
                          status.phase === 'unsupported'
                              ? 'App updates are installed through the packaged Mac app.'
                              : 'Checking for updates…',
                      tone: 'neutral',
                  }
                : null;
        case 'downloading':
        case 'restarting':
        case 'idle':
            return null;
    }
}
