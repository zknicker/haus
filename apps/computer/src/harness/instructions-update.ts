import type { ComposedInstructions } from './instructions.ts';
import type { AgentSessionState } from './session-store.ts';

/**
 * Keeps a resumed session's standing instructions current; adapted from Raft's
 * `standingPromptRefresh.ts` (present at `db5e399`).
 *
 * Every runtime driver hands the composed instructions to its runtime at launch, but a resumed
 * native session keeps the instructions it started with: Claude Code reuses its transcript's
 * system prompt on `--resume`, Codex drops `developerInstructions` on `thread/resume`, and Grok
 * Build's `session/load` ignores a rewritten `$GROK_HOME/AGENTS.md`. So the session record keeps
 * the stable fingerprint of the instructions the session has received
 * (`deliveredInstructionFingerprint`). When a resumed turn finds a different one, the full current
 * instructions go at the front of that turn's input, marked as replacing the earlier ones.
 * Nothing earlier in the conversation changes, so the runtime's prompt cache stays valid.
 *
 * Unlike Raft, a resumed session with no record gets the update once instead of a silent
 * baseline (operator decision): such a session predates the record and may run on old
 * instructions. A sub-agent wake defers it, because Claude Code's adopted wake turn replaces the
 * prompt; the next ordinary turn carries it.
 *
 * The update is ordinary conversation history, so a runtime's context compaction can summarize
 * it away. A compacted turn therefore sets the receipt back to the instructions the session
 * launched on (`launchedInstructionFingerprint`), and the next turn re-delivers whenever those
 * are no longer current.
 */
export type InstructionsUpdatePlan =
    /** A fresh session, launched on the current instructions. */
    | { kind: 'fresh' }
    /** A resumed session already on the current instructions. */
    | { kind: 'current' }
    /** A resumed session on older or unrecorded instructions: this turn re-delivers them. */
    | { block: string; kind: 'inject' }
    /** Due, but this wake turn cannot carry it. */
    | { kind: 'deferred' };

export function planInstructionsUpdate(input: {
    composed: Pick<ComposedInstructions, 'instructions' | 'stableFingerprint'>;
    isResume: boolean;
    session: Pick<AgentSessionState, 'deliveredInstructionFingerprint'>;
    wake: boolean;
}): InstructionsUpdatePlan {
    if (!input.isResume) {
        return { kind: 'fresh' };
    }
    if (input.session.deliveredInstructionFingerprint === input.composed.stableFingerprint) {
        return { kind: 'current' };
    }
    if (input.wake) {
        return { kind: 'deferred' };
    }
    return { block: formatInstructionsUpdate(input.composed.instructions), kind: 'inject' };
}

/** The turn's model prompt, led by the update when the plan injects one (Raft's `applyStandingPromptUpdate`). */
export function withInstructionsUpdate(plan: InstructionsUpdatePlan, prompt: string): string {
    return plan.kind === 'inject' ? `${plan.block}\n\n${prompt}` : prompt;
}

/** Raft's `formatStandingPromptUpdate` with Haus nouns. */
export function formatInstructionsUpdate(instructions: string): string {
    return [
        '<haus-instructions-update>',
        'Haus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.',
        '',
        instructions.trimEnd(),
        '</haus-instructions-update>',
    ].join('\n');
}

export type InstructionReceipt = Pick<
    AgentSessionState,
    'deliveredInstructionFingerprint' | 'instructionFingerprint' | 'launchedInstructionFingerprint'
>;

/**
 * The instruction receipt a turn on `plan` leaves: the current fingerprints when the session
 * launched on them, or a completed turn handed them over; otherwise the stored ones. A launch
 * delivers even when the turn is then interrupted; an interrupted update may not have. After a
 * compaction the session is known to hold only what it launched on, wherever in the turn the
 * compaction fell.
 */
export function deliveredInstructionReceipt(
    plan: InstructionsUpdatePlan,
    session: InstructionReceipt,
    composed: Pick<ComposedInstructions, 'fingerprint' | 'stableFingerprint'>,
    turn: { compacted: boolean; completed: boolean }
): InstructionReceipt {
    const launchedInstructionFingerprint =
        plan.kind === 'fresh' ? composed.stableFingerprint : session.launchedInstructionFingerprint;
    const delivered = plan.kind === 'fresh' || (turn.completed && plan.kind === 'inject');
    return {
        deliveredInstructionFingerprint: turn.compacted
            ? launchedInstructionFingerprint
            : delivered
              ? composed.stableFingerprint
              : session.deliveredInstructionFingerprint,
        instructionFingerprint: delivered ? composed.fingerprint : session.instructionFingerprint,
        launchedInstructionFingerprint,
    };
}
