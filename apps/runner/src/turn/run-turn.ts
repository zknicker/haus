import { planRulesDelivery } from '@haus/agent-prompt';
import type { AgentReasoningEffort, AgentStartCommand } from '@haus/api';
import type { RunAuthority, RunnerLink, RunTools } from '../run-context.ts';
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
import { observeTurn, turnNoProgress } from './observe-turn.ts';
import type { NoticeReceipt } from './pending-notice.ts';
import { createRunActivity } from './run-activity.ts';
import type { runRecords } from './run-records.ts';
import { harnessFor, type RuntimeDriverFactory, type RuntimeTurn } from './runtime-driver.ts';
import { readAgentSession, resolveTurnSession, writeAgentSession } from './session-file.ts';
import type { RuntimeTokenUsage } from './turn-event.ts';
import { TurnStalledError } from './turn-failure.ts';
import { composeTurnInput } from './turn-input.ts';
import { openTurnNotices } from './turn-notices.ts';
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
    readonly factory: RuntimeDriverFactory;
    readonly link: RunnerLink;
    readonly log: (line: string) => void;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly records: ReturnType<typeof runRecords>;
    readonly registerNoticeSink: (sink: NoticeSink) => () => void;
    readonly runtimeDir: string;
    readonly signal: AbortSignal;
    readonly start: AgentStartCommand;
    readonly store: ReturnType<typeof inboxStore>;
    readonly tools: RunTools;
}

export async function runTurn(input: RunTurnInput) {
    const { start } = input;
    const context = await readAgentContext(input);
    const harness = harnessFor(start.modelId);
    const composed = composeInstructions(start, context.skills, harness);
    const session = resolveTurnSession(await readAgentSession(input.agentDir), {
        generation: start.sessionGeneration,
        harness,
        modelId: start.modelId,
    });
    const driver = input.factory({
        agentDir: input.agentDir,
        agentId: start.agentId,
        instructions: composed.instructions,
        modelId: start.modelId,
        reasoningEffort: input.reasoningEffort,
        tools: input.tools,
    });
    const bootstrapFingerprint = await driver.bootstrapFingerprint(input.signal);
    const live = await driver.openSession({
        resumeFrom: session.nativeSessionId ?? undefined,
        sessionId: `${start.agentId}-${session.generation}`,
        signal: input.signal,
    });
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
    const record = (outcome: 'completed' | 'failed' | 'interrupted', compacted: boolean) =>
        writeAgentSession(
            input.agentDir,
            sessionAfterTurn({
                composedFingerprint: composed.fingerprint,
                memory,
                nativeSessionId: live.sessionId,
                outcome,
                plan,
                rules,
                session,
                turn: { bootstrapFingerprint, compacted },
            })
        );
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
        },
        await unknown.read()
    );
    await attestComposedDrain(input, turnInput.drained);
    const noProgress = new AbortController();
    const turnSignal = AbortSignal.any([input.signal, noProgress.signal]);
    let turn: RuntimeTurn;
    try {
        turn = await live.startTurn({
            prompt: composeTurnPrompt({
                instructions: plan,
                memoryBlock: memory.block,
                rulesBlock: rules.block,
                turnContent: turnInput.turnContent,
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
    const observation = await observeTurn(turn.events, {
        activity: input.activity,
        gate: notices.gate,
        noProgress: turnNoProgress,
        onNoProgress: () => noProgress.abort(),
    });
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
    await live.detach();
    await record(
        stalled || observation.aborted ? 'interrupted' : 'completed',
        observation.compacted
    );
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
