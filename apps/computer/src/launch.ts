import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedCoveWorkspace, seedFactoryManagedSkills } from '@haus/agent-workspace';
import type { AgentTurnActivitySummary } from '@haus/api';
import type { TraceCarrier } from '@haus/effect';
import type { ComputerAgentActivityUpdate } from './agent-activity.ts';
import { AgentActivityRun } from './agent-activity-run.ts';
import type {
    AgentNoticeCommand,
    AgentResetCommand,
    AgentRestartCommand,
    AgentStartCommand,
    AgentStopCommand,
    AgentTurnFrame,
    ServerDeleteCommand,
} from './agent-commands.ts';
import {
    readAgentSeedConfiguration,
    readAppliedAgentConfiguration,
    seedOrdinaryWorkspace,
} from './agent-configuration.ts';
import { parseDrainItemIds, parseInbox, parseUnreadElsewhere } from './agent-inbox-input.ts';
import { acquireAgentLaunchHost } from './agent-launch-host.ts';
import { parseTurnTraceContext } from './agent-turn-telemetry.ts';
import type { AgentTurnTimings } from './agent-turn-timings.ts';
import { computerEntrypoint } from './build-identity.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import { createComputerTools } from './computer-tools.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { StoredNoticeReceipt } from './delivery.ts';
import {
    AgentSessionResumeRejectedError,
    type HarnessAgentFactory,
    HarnessTurnFailedError,
    type NoticeSinkRegistrar,
    runHarnessTurn,
} from './harness/executor.ts';
import { ensureNativeSkillLinks } from './harness/native-skill-links.ts';
import { composeInboxDrain } from './inbox-format.ts';
import { readRunVisibleMessages } from './inbox-store.ts';
import { messageOf, writeTrace } from './launch-trace.ts';
import { mintRunner, revokeRunner } from './runner-authority.ts';
import { resolveRuntimeById, runtimeSearchPath } from './runtime-discovery.ts';
import { classifyRuntimeFailure, type RuntimeFailureKind } from './runtime-failure.ts';
import { reportRuntimeOutcome } from './runtime-issues.ts';
import { writeHausWrapper } from './wrapper.ts';

export interface Attachment {
    computerId: string;
    credential: string;
    serverId: string;
    serverOrigin: string;
    slug: string;
}

export type {
    AgentNoticeCommand,
    AgentResetCommand,
    AgentRestartCommand,
    AgentStartCommand,
    AgentStopCommand,
    AgentTurnFrame,
    ServerDeleteCommand,
    UnreadElsewhere,
} from './agent-commands.ts';

export interface RunAgentLaunchOptions {
    attachment: Attachment;
    cloudAgents?: CloudAgentWorkSupervisor;
    command: AgentStartCommand;
    dataRoot: string;
    /** Per-launch construction seam for deterministic Harness boundary tests. */
    harnessAgentFactory?: HarnessAgentFactory;
    /** Commits the Server ack immediately before the runtime accepts the prompt. */
    onRuntimeReady?(): Promise<void>;
    /** Reports a persisted busy notice that was injected after sink registration. */
    onStoredNoticeDelivered?(receipt: StoredNoticeReceipt): void;
    /** Registers the live harness input used for content-free busy notices. */
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    /** Pushes the compact turn summary up the attachment socket. */
    sendFrame(frame: unknown): void;
    serverOrigin: string;
    /** Aborts the launch — a human Stop kills the live child through this. */
    signal?: AbortSignal;
    turnTimings?: AgentTurnTimings;
    turnTraceContext?: TraceCarrier;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fakeRuntimePath = resolve(moduleDir, 'fake-runtime.ts');
/** Runs one isolated Agent launch; only its compact summary leaves Computer. */
export async function runAgentLaunch(options: RunAgentLaunchOptions): Promise<AgentTurnFrame> {
    const startedAt = new Date().toISOString();
    const { command } = options;
    const agentRoot = join(
        options.dataRoot,
        'servers',
        options.attachment.serverId,
        'agents',
        command.agentId
    );
    const dirs = {
        home: join(agentRoot, 'home'),
        runtime: join(agentRoot, 'runtime'),
        skills: join(agentRoot, 'skills'),
        workspace: join(agentRoot, 'workspace'),
    };
    await Promise.all(
        Object.values(dirs).map((dir) => mkdir(dir, { mode: 0o700, recursive: true }))
    );
    await ensureNativeSkillLinks(dirs.home, dirs.skills);

    const runtimeExecutable = resolveRuntimeById(command.runtimeId);
    if (command.runtimeId !== 'fake' && !runtimeExecutable && !options.harnessAgentFactory) {
        return reportTurn(options, {
            failureKind: 'configuration',
            messageCount: 0,
            startedAt,
            status: 'failed',
            summary: `Runtime "${command.runtimeId}" is not installed.`,
        });
    }

    let runner: { runnerId: string; runnerToken: string };
    try {
        runner = await mintRunner(options);
    } catch (error) {
        return reportTurn(options, {
            failureKind: 'transport',
            messageCount: 0,
            startedAt,
            status: 'failed',
            summary: `Runner authority mint failed: ${messageOf(error)}`,
        });
    }

    const host = acquireAgentLaunchHost({
        agentId: command.agentId,
        cloudAgents: options.cloudAgents,
        dataRoot: options.dataRoot,
        runnerToken: runner.runnerToken,
        runId: command.runId,
        serverId: options.attachment.serverId,
        serverOrigin: options.serverOrigin,
        skillsDir: dirs.skills,
    });
    const { proxy, proxyToken } = host;
    proxy.setTraceContext(options.turnTraceContext);
    proxy.setOnCommittedSend(() => options.turnTimings?.recordSend());
    let activitySequence = 0;
    const sendActivity = (activity: ComputerAgentActivityUpdate) => {
        const frame = {
            agentId: command.agentId,
            category: activity.category,
            occurredAt: activity.occurredAt,
            phase: activity.phase,
            producerSequence: ++activitySequence,
            runId: command.runId,
            ...(activity.toolRef ? { toolRef: activity.toolRef } : {}),
            type: 'agent-activity' as const,
        };
        try {
            options.sendFrame(frame);
        } catch {
            // Disconnected activity presentation must not fail a model turn.
        }
    };
    const activity = new AgentActivityRun(options.runtime, sendActivity);
    proxy.setActivityRun(activity);
    const tokenFile = join(dirs.runtime, 'proxy-token');
    const binDir = join(dirs.runtime, 'bin');
    await mkdir(binDir, { mode: 0o700, recursive: true });
    await writeFile(tokenFile, proxyToken, { mode: 0o600 });
    const wrapperPath = await writeHausWrapper({
        binDir,
        entrypoint: computerEntrypoint(),
        identity: {
            agentId: command.agentId,
            proxyTokenFile: tokenFile,
            proxyUrl: proxy.url,
            serverUrl: options.serverOrigin,
        },
    });
    // The loopback token and managed CLI are the Agent's only reachable authority.
    const agentEnv: Record<string, string> = {
        HAUS_AGENT_ID: command.agentId,
        HAUS_AGENT_PROXY_TOKEN_FILE: tokenFile,
        HAUS_AGENT_PROXY_URL: proxy.url,
        HAUS_AGENT_TOKEN_FILE: tokenFile,
        HAUS_SERVER_URL: options.serverOrigin,
        HAUS_WRAPPER: wrapperPath,
        PATH: [
            binDir,
            runtimeExecutable?.path ? dirname(runtimeExecutable.path) : null,
            runtimeExecutable?.searchPath ?? runtimeSearchPath(),
        ]
            .filter(Boolean)
            .join(':'),
    };

    let result: {
        failureKind?: RuntimeFailureKind;
        status: 'completed' | 'failed' | 'interrupted';
        tokenUsage?: AgentTurnFrame['tokenUsage'];
    } = {
        status: 'failed',
    };
    try {
        await options.onRuntimeReady?.();
        result =
            command.runtimeId === 'fake'
                ? {
                      status: await runFakeRuntime({
                          activity,
                          agentEnv,
                          command,
                          dataRoot: options.dataRoot,
                          dirs,
                          runtime: options.runtime,
                          signal: options.signal,
                      }),
                  }
                : await runRealRuntime({
                      turnTimings: options.turnTimings,
                      agentEnv,
                      agentRoot,
                      command,
                      dataRoot: options.dataRoot,
                      dirs,
                      harnessAgentFactory: options.harnessAgentFactory,
                      onStoredNoticeDelivered: options.onStoredNoticeDelivered,
                      activity,
                      registerNoticeSink: options.registerNoticeSink,
                      runtime: options.runtime,
                      tools: createComputerTools({ host, options, command }),
                      signal: options.signal,
                  });
    } finally {
        await revokeRunner(options, runner.runnerId).catch(() => undefined);
        proxy.clearRunnerToken();
        proxy.setActivityRun(undefined);
        await activity.close(result.status);
    }

    await reportRuntimeOutcome(
        {
            dataRoot: options.dataRoot,
            runtimeId: command.runtimeId,
            startedAt,
            ...result,
        },
        options.runtime
    );
    return reportTurn(options, {
        messageCount: proxy.sendCount(),
        activity: activity.snapshot(),
        startedAt,
        ...result,
        summary:
            result.status === 'completed'
                ? completedTurnSummary(proxy.sendCount())
                : result.status === 'interrupted'
                  ? 'The Agent turn was interrupted.'
                  : `The Agent turn did not complete (${result.failureKind ?? 'unknown'}).`,
        visibleMessages: await readRunVisibleMessages(
            {
                agentId: command.agentId,
                dataRoot: options.dataRoot,
                serverId: options.attachment.serverId,
            },
            command.runId
        ),
    });
}

function completedTurnSummary(messageCount: number) {
    return `Sent ${messageCount} message(s).`;
}

/** Validates a Server→Computer frame as a launch command. Fails closed to null. */
export function parseStartCommand(frame: unknown): AgentStartCommand | null {
    if (!isRecord(frame) || frame.type !== 'start') {
        return null;
    }
    const idFields = ['agentId', 'chatId', 'modelId', 'runId', 'runtimeId'] as const;
    for (const field of idFields) {
        if (typeof frame[field] !== 'string' || (frame[field] as string).length === 0) {
            return null;
        }
    }
    const inbox = parseInbox(frame.inbox);
    const drainItemIds = parseDrainItemIds(frame.drainItemIds);
    const warmDrainItemIds = parseDrainItemIds(frame.warmDrainItemIds);
    const unreadElsewhere = parseUnreadElsewhere(frame.unreadElsewhere);
    if (!(inbox && drainItemIds && warmDrainItemIds && unreadElsewhere)) {
        return null;
    }
    if (
        typeof frame.sessionGeneration !== 'number' ||
        !Number.isInteger(frame.sessionGeneration) ||
        frame.sessionGeneration < 1
    ) {
        return null;
    }
    if (
        !['concrete', 'notice'].includes(frame.inboxDelivery as string) ||
        typeof frame.totalPending !== 'number' ||
        !Number.isInteger(frame.totalPending) ||
        frame.totalPending < 0
    ) {
        return null;
    }
    for (const field of ['agentDescription', 'agentName', 'homeTimezone'] as const) {
        if (frame[field] !== undefined && typeof frame[field] !== 'string') {
            return null;
        }
    }
    const webAccess = ['fetch-only', 'search', 'search-only'].includes(frame.webAccess as string)
        ? (frame.webAccess as 'fetch-only' | 'search' | 'search-only')
        : undefined;
    const traceContext = parseTurnTraceContext(frame.traceContext);
    if (frame.traceContext !== undefined && !traceContext) {
        return null;
    }
    return {
        agentId: frame.agentId as string,
        ...(typeof frame.agentDescription === 'string'
            ? { agentDescription: frame.agentDescription }
            : {}),
        ...(typeof frame.agentName === 'string' ? { agentName: frame.agentName } : {}),
        chatId: frame.chatId as string,
        drainItemIds,
        ...(typeof frame.homeTimezone === 'string' ? { homeTimezone: frame.homeTimezone } : {}),
        inbox,
        inboxDelivery: frame.inboxDelivery as 'concrete' | 'notice',
        modelId: frame.modelId as string,
        runId: frame.runId as string,
        runtimeId: frame.runtimeId as string,
        sessionGeneration: frame.sessionGeneration,
        totalPending: frame.totalPending,
        ...(traceContext ? { traceContext } : {}),
        type: 'start',
        unreadElsewhere,
        warmDrainItemIds,
        ...(webAccess ? { webAccess } : {}),
    };
}

/** Validates a Server→Computer frame as a stop command. Fails closed to null. */
export function parseStopCommand(frame: unknown): AgentStopCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'stop' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        typeof frame.runId !== 'string' ||
        frame.runId.length === 0
    ) {
        return null;
    }
    return { agentId: frame.agentId, runId: frame.runId, type: 'stop' };
}

/** Validates a Server→Computer restart command. Fails closed to null. */
export function parseRestartCommand(frame: unknown): AgentRestartCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-restart' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0
    ) {
        return null;
    }
    return { agentId: frame.agentId, type: 'agent-restart' };
}

/** Validates a Server→Computer reset command. Fails closed to null. */
export function parseResetCommand(frame: unknown): AgentResetCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-reset' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        !['full', 'session'].includes(frame.kind as string) ||
        typeof frame.sessionGeneration !== 'number' ||
        !Number.isInteger(frame.sessionGeneration) ||
        frame.sessionGeneration < 1
    ) {
        return null;
    }
    return {
        agentId: frame.agentId,
        kind: frame.kind as 'full' | 'session',
        sessionGeneration: frame.sessionGeneration,
        type: 'agent-reset',
    };
}

/** Applies reset semantics inside exactly one Server/Agent filesystem partition. */
export async function resetAgentState(input: {
    agentId: string;
    dataRoot: string;
    kind: 'full' | 'session';
    serverId: string;
}): Promise<void> {
    const agentRoot = join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId);
    if (input.kind === 'full') {
        const seed = await readAgentSeedConfiguration(agentRoot);
        await Promise.all(
            ['home', 'runtime', 'skills', 'workspace', '.agent-runs', 'session.json'].map((entry) =>
                rm(join(agentRoot, entry), { force: true, recursive: true })
            )
        );
        if (seed) {
            await Promise.all([
                seed.factoryKind === 'cove'
                    ? seedCoveWorkspace(join(agentRoot, 'workspace'))
                    : seedOrdinaryWorkspace(seed, join(agentRoot, 'workspace')),
                seedFactoryManagedSkills(join(agentRoot, 'skills')),
            ]);
        }
        return;
    }
    await Promise.all([
        rm(join(agentRoot, 'session.json'), { force: true }),
        rm(join(agentRoot, '.agent-runs'), { force: true, recursive: true }),
        rm(join(agentRoot, 'runtime', 'inbox'), { force: true, recursive: true }),
        rm(join(agentRoot, 'runtime', 'pending-notice.json'), { force: true }),
    ]);
}

/** Validates a Server→Computer busy-inbox snapshot. Fails closed to null. */
export function parseNoticeCommand(frame: unknown): AgentNoticeCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'notice' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        typeof frame.runId !== 'string' ||
        frame.runId.length === 0 ||
        typeof frame.totalPending !== 'number' ||
        !Number.isInteger(frame.totalPending) ||
        frame.totalPending < 1 ||
        !parseInbox(frame.inbox)?.length
    ) {
        return null;
    }
    const unreadElsewhere = parseUnreadElsewhere(frame.unreadElsewhere);
    if (!unreadElsewhere) {
        return null;
    }
    return {
        agentId: frame.agentId,
        inbox: parseInbox(frame.inbox) ?? [],
        runId: frame.runId,
        totalPending: frame.totalPending,
        type: 'notice',
        unreadElsewhere,
    };
}

export function parseServerDeleteCommand(frame: unknown): ServerDeleteCommand | null {
    return isRecord(frame) && frame.type === 'server-delete' && Object.keys(frame).length === 1
        ? { type: 'server-delete' }
        : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function reportTurn(
    options: RunAgentLaunchOptions,
    input: {
        activity?: AgentTurnActivitySummary;
        messageCount: number;
        failureKind?: RuntimeFailureKind;
        startedAt: string;
        status: 'completed' | 'failed' | 'interrupted';
        summary: string;
        tokenUsage?: AgentTurnFrame['tokenUsage'];
        visibleMessages?: Array<{ chatId: string; id: string; sequence: number }>;
    }
): AgentTurnFrame {
    const frame: AgentTurnFrame = {
        activity: input.activity ?? { operations: [] },
        agentId: options.command.agentId,
        endedAt: new Date().toISOString(),
        ...(input.failureKind ? { failureKind: input.failureKind } : {}),
        messageCount: input.messageCount,
        modelId: options.command.modelId,
        outputProduced: input.messageCount > 0,
        runId: options.command.runId,
        runtimeId: options.command.runtimeId,
        startedAt: input.startedAt,
        status: input.status,
        summary: input.summary,
        tokenUsage: input.tokenUsage ?? null,
        type: 'turn',
        visibleMessages: input.visibleMessages ?? [],
    };
    options.sendFrame(frame);
    return frame;
}

interface RuntimeExecutionInput {
    activity: AgentActivityRun;
    agentEnv: Record<string, string>;
    command: AgentStartCommand;
    dataRoot: string;
    dirs: { home: string; runtime: string; skills: string; workspace: string };
    onStoredNoticeDelivered?: (receipt: StoredNoticeReceipt) => void;
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    signal?: AbortSignal;
    turnTimings?: AgentTurnTimings;
}

/** Deterministic local model with the real managed CLI and loopback output path. */
async function runFakeRuntime(
    input: RuntimeExecutionInput
): Promise<'completed' | 'failed' | 'interrupted'> {
    const child = Bun.spawn([process.execPath, fakeRuntimePath], {
        cwd: input.dirs.workspace,
        env: {
            ...process.env,
            ...input.agentEnv,
            HAUS_TURN_PROMPT: composeInboxDrain(
                input.command.inbox ?? [],
                input.command.homeTimezone ?? 'UTC'
            ),
            HOME: input.dirs.home,
        },
        signal: input.signal,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [out, err, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    await writeTrace(input, `${out}${err}`);
    return input.signal?.aborted ? 'interrupted' : exitCode === 0 ? 'completed' : 'failed';
}

/** Drives a real Harness executor; durable replies leave only through the managed CLI. */
async function runRealRuntime(
    input: RuntimeExecutionInput & {
        agentRoot: string;
        harnessAgentFactory?: HarnessAgentFactory;
        tools: import('@ai-sdk/provider-utils').ToolSet;
    }
): Promise<{
    failureKind?: RuntimeFailureKind;
    status: 'completed' | 'failed' | 'interrupted';
    tokenUsage?: AgentTurnFrame['tokenUsage'];
}> {
    const { command } = input;
    try {
        const seed = await readAgentSeedConfiguration(input.agentRoot);
        const turn = await runHarnessTurn({
            turnTimings: input.turnTimings,
            agentId: command.agentId,
            // The Server owns the Agent handle/description; sensible defaults keep
            // the managed contract intact when a facet is omitted.
            agentName: command.agentName ?? command.agentId,
            agentRoot: input.agentRoot,
            dataRoot: input.dataRoot,
            env: input.agentEnv,
            factoryKind: seed?.factoryKind ?? 'ordinary',
            homeDir: input.dirs.home,
            homeTimezone: command.homeTimezone ?? 'UTC',
            harnessAgentFactory: input.harnessAgentFactory,
            initialRole: command.agentDescription ?? null,
            modelId: command.modelId,
            reasoningEffort:
                (await readAppliedAgentConfiguration(input.agentRoot))?.reasoningEffort ?? 'medium',
            inbox: command.inbox ?? [],
            inboxDelivery: command.inboxDelivery,
            onStoredNoticeDelivered: input.onStoredNoticeDelivered,
            activity: input.activity,
            registerNoticeSink: input.registerNoticeSink,
            runtime: input.runtime,
            runId: command.runId,
            runtimeId: command.runtimeId,
            sessionGeneration: command.sessionGeneration,
            signal: input.signal,
            skillsDir: input.dirs.skills,
            totalPending: command.totalPending,
            webAccess: command.webAccess ?? null,
            workspaceDir: input.dirs.workspace,
            tools: input.tools,
        });
        await writeTrace(input, 'Harness turn completed.\n');
        return {
            status: turn.aborted ? 'interrupted' : 'completed',
            tokenUsage: turn.tokenUsage,
        };
    } catch (error) {
        await writeTrace(input, `Harness turn failed: ${messageOf(error)}\n`);
        const failure = error instanceof HarnessTurnFailedError ? error.cause : error;
        return {
            failureKind:
                failure instanceof AgentSessionResumeRejectedError
                    ? 'session-resume'
                    : classifyRuntimeFailure(failure),
            status: 'failed',
            tokenUsage: error instanceof HarnessTurnFailedError ? error.tokenUsage : null,
        };
    }
}
