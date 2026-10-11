import type { GithubTriggerProblem } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { GithubNotImplementedError } from './not-implemented.ts';

export interface GithubTriggerProblemMark {
    now: Date;
    problem: GithubTriggerProblem;
    /** Every armed, undeleted `github` Trigger on an installation, or the named Triggers. */
    scope: { installationRowId: string } | { triggerIds: readonly string[] };
    serverId: string;
}

/** One Trigger that entered the problem, for the caller's after-commit notice dispatch. */
export interface GithubTriggerProblemEntered {
    ownerAgentId: string;
    problem: GithubTriggerProblem;
    problemSince: Date;
    triggerId: string;
}

/**
 * Puts Triggers into `problem` inside the caller's transaction: sets
 * `problem` and `problem_since`, bumps `version`, and enqueues one
 * `trigger_problem` notice per Trigger that newly entered it
 * (specs/github-triggers.md#failure-modes). A Trigger already in that problem
 * is left alone. Notices dispatch after the caller commits.
 */
export function markGithubTriggersProblem(
    _tx: HausDatabase,
    _mark: GithubTriggerProblemMark
): Promise<{ entered: GithubTriggerProblemEntered[] }> {
    return Promise.reject(new GithubNotImplementedError('markGithubTriggersProblem (Slice B)'));
}
