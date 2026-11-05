import type { AgentActivityRun } from '../agent-activity-run.ts';
import type { InstructionsUpdatePlan } from './instructions-update.ts';

export interface InstructionRefresh {
    bootstrapDrift: boolean;
    restartRequested: boolean;
    resumed: boolean;
    /** The instructions update a resume of this session will carry. */
    update: InstructionsUpdatePlan;
    /** False when a Cove factory-guidance conflict keeps the version unapplied. */
    versionCanApply: boolean;
    versionDrift: boolean;
}

/**
 * Shows `updating_instructions` on a resumed turn that refreshes what its session runs on: a
 * Restart, a changed runtime bootstrap, an instructions update the turn carries, or Haus Agent
 * version drift the turn can apply. A wake turn that defers the instructions update applies no
 * version, so it shows nothing for them.
 */
export async function startInstructionRefreshActivity(
    activity: AgentActivityRun,
    key: string,
    refresh: InstructionRefresh
): Promise<void> {
    const due =
        refresh.restartRequested ||
        refresh.bootstrapDrift ||
        refresh.update.kind === 'inject' ||
        (refresh.versionDrift && refresh.versionCanApply && refresh.update.kind !== 'deferred');
    if (refresh.resumed && due && !activity.isActive(key)) {
        await activity.start({ category: 'updating_instructions', key });
    }
}
