import { RuntimeResumeRejectedError } from './resume-rejected.ts';

/**
 * What a Worker's next turn resumes: the runtime's native conversation, which stays in the
 * runtime's own store under the machine user's HOME (specs/runtime-drivers.md).
 */
export interface ClaudeResumeState {
    /** Claude Code's conversation id, passed back as `--resume`. */
    readonly claudeSessionId: string;
    readonly runtime: 'claude-code';
    readonly version: 1;
}

export interface CodexResumeState {
    readonly runtime: 'codex';
    /** The app-server thread resumed with `thread/resume`. */
    readonly threadId: string;
    readonly version: 1;
}

export type RuntimeResumeState = ClaudeResumeState | CodexResumeState;

/** `state` as `runtimeId`'s own shape; another runtime's state is a typed resume rejection. */
export function resumeStateFor<Runtime extends RuntimeResumeState['runtime']>(
    runtimeId: Runtime,
    state: RuntimeResumeState
) {
    if (state.runtime !== runtimeId) {
        throw new RuntimeResumeRejectedError(
            runtimeId,
            'foreign-state',
            `The stored session belongs to ${state.runtime}, not ${runtimeId}.`
        );
    }
    return state as Extract<RuntimeResumeState, { runtime: Runtime }>;
}
