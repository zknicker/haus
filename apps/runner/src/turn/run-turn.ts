import { planRulesDelivery } from '@haus/agent-prompt';
import type { AgentReasoningEffort, AgentStartCommand, RunnerModelConnection } from '@haus/api';
import type { RunJournal } from '../journal/run-journal.ts';
import type { RunAuthority, RunnerLink, RunTools } from '../run-context.ts';
import { createRunThoughts } from '../thoughts/run-thoughts.ts';
import { turnKnownSecrets } from '../thoughts/thought-redaction.ts';
import { readAgentContext } from './agent-context.ts';
import { attestComposedDrain } from './composed-drain.ts';
import type { inboxStore } from './inbox-store.ts';
import {
    composeInstructions,
    composeTurnPrompt,
    planInstructionsUpdate,
    planMemoryDelivery,
    sessionAfterTurn,
} from './instructions.ts';
import { ackManagedSkillNotice, type ManagedSkillNotice } from './managed-skill-notice.ts';
import { observeTurn, turnNoProgress } from './observe-turn.ts';
import type { NoticeReceipt } from './pending-notice.ts';
import { readHarnessContext, reportContext } from './report-context.ts';
import { createRunActivity } from './run-activity.ts';
import type { runRecords } from './run-records.ts';
import { harnessFor, type RuntimeDriverFactory, type RuntimeTurn } from './runtime-driver.ts';
import { readAgentSession, resolveTurnSession, writeAgentSession } from './session-file.ts';
import { composeTaskOpening } from './task-opening.ts';
import type { RuntimeTokenUsage } from './turn-event.ts';
import { TurnStalledError } from './turn-failure.ts';
import { composeTurnInput } from './turn-input.ts';
import { openTurnNotices } from './turn-notices.ts';
import type { TurnTimings } from './turn-timings.ts';
import { unknownToolCalls } from './unknown-tool-calls.ts';

export const turnSettleBoundMs = 20_000;

export type RunTurnResult =
    | {
          readonly failure: null;
          readonly status: 'completed' | 'interrupted';
          readonly tokenUsage: RuntimeTokenUsage | null;
      }
    | {
          readonly failure: unknown;
          readonly status: 'failed';
          readonly tokenUsage: RuntimeTokenUsage | null;
      };

export type NoticeSink = (notice: string, receipt?: NoticeReceipt) => Promise<boolean>;

export interface RunTurnInput {
    readonly activity: ReturnType<typeof createRunActivity>;
    readonly agentDir: string;
    readonly authority: RunAuthority;
    readonly connection: RunnerModelConnection;
    readonly factory: RuntimeDriverFactory;
    readonly journal: RunJournal;
    readonly link: RunnerLink;
    readonly log: (line: string) => void;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly records: ReturnType<typeof runRecords>;
    readonly registerNoticeSink: (sink: NoticeSink) => () => void;
    readonly runtimeDir: string;
    readonly signal: AbortSignal;
    readonly start: AgentStartCommand;
    readonly store: ReturnType<typeof inboxStore>;
    readonly timings: TurnTimings;
    readonly tools: RunTools;
}

export async function runTurn(input: RunTurnInput) {
    const { start } = input;
    const context = await readAgentContext(input);
    const harness = harnessFor(start.modelId);
    const composed = composeInstructions(start, context.skills, harness, context.policy);
    const assigned = {
        generation: start.sessionGeneration,
        harness,
        modelId: start.modelId,
    };
    const stored = resolveTurnSession(await readAgentSession(input.agentDir), assigned);
    const driver = input.factory({
        agentDir: input.agentDir,
        agentId: start.agentId,
        connection: input.connection,
        instructions: composed.instructions,
        modelId: start.modelId,
        ...(context.policy ? { policy: context.policy } : {}),
        reasoningEffort: input.reasoningEffort,
        runId: start.runId,
        runtimeId: start.runtimeId,
        sessionGeneration: start.sessionGeneration,
        skillListing: composed.skillListing,
        tools: input.tools,
    });
    const bootstrapFingerprint = await driver.bootstrapFingerprint(input.signal);
    input.timings.mark('harnessReadyMs');
    const live = await input.timings.measure('sessionCreateMs', () =>
        driver.openSession({
            onSlotWait: (waitedMs) => {
                input.timings.record('slotWaitMs', waitedMs);
                input.log(
                    `Runner held ${start.agentId}'s turn ${start.runId} ${waitedMs} ms for a Claude slot.`
                );
            },
            resumeFrom: stored.nativeSessionId ?? undefined,
            sessionId: `${start.agentId}-${stored.generation}`,
            signal: input.signal,
        })
    );
    const session = resolveTurnSession(await readAgentSession(input.agentDir), assigned);
    const plan = planInstructionsUpdate({
        composed,
        isResume: live.isResume && driver.instructionsOnResume === 'launched',
        session,
    });
    const memory = planMemoryDelivery({
        content: context.memory,
        isResume: live.isResume,
        receipt: session.deliveredMemoryDigest,
    });
    const rules = planRulesDelivery({
        files: context.rules,
        isResume: live.isResume,
        receipts: session.deliveredRuleDigests,
    });
    const record = async (outcome: 'completed' | 'failed' | 'interrupted', compacted: boolean) => {
        const recorded = sessionAfterTurn({
            composedFingerprint: composed.fingerprint,
            memory,
            nativeSessionId: live.sessionId,
            outcome,
            plan,
            rules,
            session,
            turn: { bootstrapFingerprint, compacted },
        });
        await writeAgentSession(input.agentDir, recorded);
        return recorded;
    };
    if (input.signal.aborted) {
        await live.detach();
        await record('interrupted', false);
        const interrupted: RunTurnResult = {
            failure: null,
            status: 'interrupted',
            tokenUsage: null,
        };
        return interrupted;
    }
    const unknown = unknownToolCalls(input.runtimeDir);
    const turnInput = composeTurnInput(
        start,
        {
            isColdStart: !live.isResume,
            resumesInterruptedTurn: live.isResume && session.interruptedTurn,
            sessionGeneration: session.generation,
            sessionKind: context.policy?.kind ?? 'captain',
        },
        await unknown.read()
    );
    await attestComposedDrain(input, turnInput.drained);
    const opening = live.isResume
        ? null
        : await composeTaskOpening({ ...input, policy: context.policy });
    const noProgress = new AbortController();
    const turnSignal = AbortSignal.any([input.signal, noProgress.signal]);
    let turn: RuntimeTurn;
    try {
        turn = await live.startTurn({
            prompt: composeTurnPrompt({
                instructions: plan,
                memoryBlock: memory.block,
                rulesBlock: rules.block,
                skillNotice: context.skillNotice,
                turnContent: opening
                    ? `${opening}\n\n${turnInput.turnContent}`
                    : turnInput.turnContent,
            }),
            signal: turnSignal,
        });
    } catch (error) {
        await live.destroy();
        throw error;
    }
    await unknown.clear();
    const notices = openTurnNotices({
        onDelivered: (receipt) =>
            input.link.send({
                agentId: start.agentId,
                runId: receipt.runId,
                type: 'notice-ack',
                workIds: [...receipt.workIds],
            }),
        primaryNotice: turnInput.notice,
        runtimeDir: input.runtimeDir,
        session: live,
    });
    const unregister = input.registerNoticeSink(notices.deliver);
    input.activity.start('thinking', 'thinking');
    const thoughts = createRunThoughts({
        agentId: start.agentId,
        knownSecrets: turnKnownSecrets(
            input.authority.runCredential,
            input.connection.credential,
            process.env
        ),
        runId: start.runId,
        send: (frame) => input.link.send(frame),
    });
    const observation = await observeTurn(
        input.timings.observe(input.journal.journaled(turn.events)),
        {
            activity: input.activity,
            gate: notices.gate,
            noProgress: turnNoProgress,
            onNoProgress: () => noProgress.abort(),
            thoughts,
        }
    );
    thoughts.close();
    unregister();
    const stalled = noProgress.signal.aborted && !input.signal.aborted;
    const settled = await settleWithin(turn, observation.aborted || stalled);
    if (await notices.returnUnconsumed(turn)) {
        input.log(`Runner kept an unconsumed inbox notice for ${start.agentId}'s next turn.`);
    }
    if (!settled || (observation.failure && !stalled)) {
        input.activity.finish('thinking', 'failed');
        await live.destroy();
        const failed: RunTurnResult = {
            failure: observation.failure ?? new TurnStalledError(),
            status: 'failed',
            tokenUsage: observation.tokenUsage,
        };
        return failed;
    }
    const harnessContext = await readHarnessContext(live, input.log);
    await live.detach();
    const outcome = stalled || observation.aborted ? 'interrupted' : 'completed';
    reportContext({
        composed,
        harness: harnessContext,
        link: input.link,
        memory: context.memory,
        providerTokens: observation.contextTokens,
        recorded: await record(outcome, observation.compacted),
        rules: context.rules,
        start,
    });
    await settleSkillNotice(input, outcome, context.skillNotice);
    if (stalled) {
        input.activity.finish('thinking', 'failed');
        const stalledResult: RunTurnResult = {
            failure: new TurnStalledError(),
            status: 'failed',
            tokenUsage: observation.tokenUsage,
        };
        return stalledResult;
    }
    const finished: RunTurnResult = {
        failure: null,
        status: observation.aborted ? 'interrupted' : 'completed',
        tokenUsage: observation.tokenUsage,
    };
    input.activity.finish('thinking', finished.status);
    return finished;
}

async function settleSkillNotice(
    input: Pick<RunTurnInput, 'authority' | 'log' | 'start'>,
    outcome: 'completed' | 'interrupted',
    notice: ManagedSkillNotice | null
) {
    if (outcome !== 'completed' || !notice) {
        return;
    }
    await ackManagedSkillNotice(input.authority, notice).catch((error: unknown) =>
        input.log(`Runner could not clear ${input.start.agentId}'s skill notice: ${String(error)}`)
    );
}

async function settleWithin(turn: RuntimeTurn, stopping: boolean) {
    if (!stopping) {
        await turn.settle();
        return true;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), turnSettleBoundMs);
    });
    try {
        return await Promise.race([turn.settle().then(() => true), bound]);
    } finally {
        clearTimeout(timer);
    }
}
