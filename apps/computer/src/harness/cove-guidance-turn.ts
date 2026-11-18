import { inspectCoveFactoryGuidance, reconcileCoveFactoryGuidance } from '@haus/agent-workspace';
import type { AgentActivityRun } from '../agent-activity-run.ts';
import {
    coveGuidanceConflictNotice,
    coveGuidanceRefreshNotice,
    coveTurnGuidanceNotice,
    hasPendingCoveGuidanceRefresh,
    markCoveGuidanceRefreshPending,
} from './cove-guidance-refresh.ts';

/** What one turn learned while reconciling Cove's factory-managed onboarding guidance. */
export interface CoveGuidanceTurnState {
    /** Private one-turn notice prepended to the turn content, if any. */
    notice: string | null;
    refreshCanComplete: boolean;
    refreshPending: boolean;
    /** False when a guidance conflict must keep the Haus Agent version drift unapplied. */
    versionCanApply: boolean;
}

/** Reconciles Cove factory guidance before a turn; ordinary Agents pass through untouched. */
export async function prepareCoveGuidanceForTurn(input: {
    activity: AgentActivityRun;
    activityKey: string;
    agentRoot: string;
    factoryKind: 'cove' | 'ordinary';
    workspaceDir: string;
}): Promise<CoveGuidanceTurnState> {
    const state: CoveGuidanceTurnState = {
        notice: coveTurnGuidanceNotice(input.factoryKind),
        refreshCanComplete: false,
        refreshPending: false,
        versionCanApply: true,
    };
    if (input.factoryKind !== 'cove') {
        return state;
    }
    const startActivity = async () => {
        if (!input.activity.isActive(input.activityKey)) {
            await input.activity.start({
                category: 'updating_instructions',
                key: input.activityKey,
            });
        }
    };
    const conflict = async (files: readonly string[]) => {
        await input.activity.finish(input.activityKey, 'failed');
        state.versionCanApply = false;
        state.refreshCanComplete = false;
        state.notice = coveGuidanceConflictNotice(files);
    };
    if (await hasPendingCoveGuidanceRefresh(input.agentRoot)) {
        state.refreshPending = true;
        state.refreshCanComplete = true;
        await startActivity();
        state.notice = coveGuidanceRefreshNotice;
    }
    const plan = await inspectCoveFactoryGuidance(input.workspaceDir);
    if (plan.kind === 'current') {
        return state;
    }
    await startActivity();
    if (plan.kind === 'conflict') {
        await conflict(plan.files);
        return state;
    }
    await markCoveGuidanceRefreshPending(input.agentRoot);
    state.refreshPending = true;
    state.refreshCanComplete = true;
    const result = await reconcileCoveFactoryGuidance(input.workspaceDir);
    if (result.kind === 'conflict') {
        await conflict(result.files);
    } else {
        state.notice = coveGuidanceRefreshNotice;
    }
    return state;
}
