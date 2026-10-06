import type { HausUpdateView } from './haus-update-model.ts';

export type HausUpdateAction = NonNullable<HausUpdateView['primaryAction']>;

/**
 * Routes the footer's primary action. A ready App restarts at once: the
 * Restart now / Later offer belongs only to the end of a pressed run.
 */
export function performHausUpdateAction(
    action: HausUpdateAction,
    handlers: { reload: () => void; restartApp: () => void; run: () => void }
) {
    switch (action.kind) {
        case 'reload':
            handlers.reload();
            return;
        case 'restart':
            handlers.restartApp();
            return;
        case 'retry':
        case 'start':
            handlers.run();
            return;
    }
}
