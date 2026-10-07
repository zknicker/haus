import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedCoveWorkspace } from '@haus/agent-workspace';
import type { TraceCarrier } from '@haus/effect';
import { AgentActivityRun } from './agent-activity-run.ts';
import type { AgentStartCommand, AgentTurnFrame } from './agent-commands.ts';
import {
    readAgentSeedConfiguration,
    readAppliedAgentConfiguration,
    seedOrdinaryWorkspace,
} from './agent-configuration.ts';
import { acquireAgentLaunchHost } from './agent-launch-host.ts';
import { createRunFrames } from './agent-run-frames.ts';
import type { AgentTurnTimings } from './agent-turn-timings.ts';
import { computerEntrypoint } from './build-identity.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import { createComputerTools } from './computer-tools.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { StoredNoticeReceipt } from './delivery.ts';
import {
    type HarnessAgentFactory,
    type NoticeSinkRegistrar,
    runHarnessTurn,
} from './harness/executor.ts';
import { ensureNativeSkillLinks } from './harness/native-skill-links.ts';
import {
    type AgentThoughtNarrator,
    createAgentThoughtNarrator,
} from './harness/thought-narrator.ts';
import { composeInboxDrain } from './inbox-format.ts';
import { readRunVisibleMessages } from './inbox-store.ts';
import {
    fakeRuntimeOutcome,
    runnerMintFailureReport,
    runtimeNotInstalledReport,
} from './launch-failure-turns.ts';
import { messageOf, writeTrace } from './launch-trace.ts';
import { reportTurn } from './launch-turn-report.ts';
import { seedAgentManagedSkills } from './managed-skill-changes.ts';
import { mintRunner, revokeRunner } from './runner-authority.ts';
import { resolveRuntimeById, runtimeSearchPath } from './runtime-discovery.ts';
import { reportRuntimeOutcome } from './runtime-issues.ts';
import {
    type RuntimeTurnOutcome,
    reportHarnessTurnFailure,
    settledTurnOutcome,
} from './turn-failure-report.ts';
import { type OpenTurnLedger, openTurnLedger } from './turn-ledger.ts';
import { visibilityReceipt } from './visibility-receipt.ts';
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
    const { command } = options;
    const agentRoot = join(
        options.dataRoot,
        'servers',
        options.attachment.serverId,
        'agents',
        command.agentId
    );
    // A relaunch of the same run after a Computer restart resumes its first start
    // and settled totals, so the summary spans the whole run.
    const ledger = await openTurnLedger({ agentRoot, now: () => new Date(), runId: command.runId });
    try {
        return await runLedgeredLaunch(options, agentRoot, ledger);
    } finally {
        await ledger.remove();
    }
}

async function runLedgeredLaunch(
    options: RunAgentLaunchOptions,
    agentRoot: string,
    ledger: OpenTurnLedger
): Promise<AgentTurnFrame> {
    const { command } = options;
    const { startedAt } = ledger;
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
        return reportTurn(options, runtimeNotInstalledReport(command.runtimeId, startedAt));
    }

    let runner: { runnerId: string; runnerToken: string };
    try {
        runner = await mintRunner(options);
    } catch (error) {
        await writeTrace({ command, dirs }, `Runner authority mint failed: ${messageOf(error)}\n`);
        return reportTurn(options, runnerMintFailureReport(error, startedAt));
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
    proxy.setOnCommittedSend((send) => options.turnTimings?.recordSend(send));
    const frames = createRunFrames({ ...command, sendFrame: options.sendFrame });
    const activity = new AgentActivityRun(options.runtime, frames.activity, {
        onCounts: (summary) => ledger.record(summary),
        seed: ledger.seed,
    });
    const thoughts = createAgentThoughtNarrator({ emit: frames.thought });
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

    let result: RuntimeTurnOutcome = { status: 'failed' };
    try {
        await options.onRuntimeReady?.();
        result =
            command.runtimeId === 'fake'
                ? fakeRuntimeOutcome(
                      await runFakeRuntime({
                          activity,
                          agentEnv,
                          command,
                          dataRoot: options.dataRoot,
                          dirs,
                          runtime: options.runtime,
                          serverId: options.attachment.serverId,
                          signal: options.signal,
                      })
                  )
                : await runRealRuntime({
                      attestVisible: visibilityReceipt(options.serverOrigin, runner.runnerToken),
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
                      serverId: options.attachment.serverId,
                      thoughts,
                      tools: createComputerTools({ host, options, command }),
                      signal: options.signal,
                  });
    } finally {
        await revokeRunner(options, runner.runnerId).catch(() => undefined);
        proxy.clearRunnerToken();
        proxy.setActivityRun(undefined);
        thoughts.close();
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
                ? `Sent ${proxy.sendCount()} message(s).`
                : result.status === 'interrupted'
                  ? 'The Agent turn was interrupted.'
                  : (result.summary ??
                    `The Agent turn did not complete (${result.failureKind ?? 'unknown'}).`),
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
                seedAgentManagedSkills(agentRoot),
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

interface RuntimeExecutionInput {
    activity: AgentActivityRun;
    agentEnv: Record<string, string>;
    command: AgentStartCommand;
    dataRoot: string;
    dirs: { home: string; runtime: string; skills: string; workspace: string };
    onStoredNoticeDelivered?: (receipt: StoredNoticeReceipt) => void;
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    serverId: string;
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
        attestVisible: ReturnType<typeof visibilityReceipt>;
        harnessAgentFactory?: HarnessAgentFactory;
        thoughts?: AgentThoughtNarrator;
        tools: import('@ai-sdk/provider-utils').ToolSet;
    }
): Promise<RuntimeTurnOutcome> {
    const { command } = input;
    try {
        const seed = await readAgentSeedConfiguration(input.agentRoot);
        const turn = await runHarnessTurn({
            turnTimings: input.turnTimings,
            agentId: command.agentId,
            attestVisible: input.attestVisible,
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
            conversationStyle: command.agentConversationStyle ?? null,
            signatureEmoji: command.agentSignatureEmoji ?? null,
            modelId: command.modelId,
            reasoningEffort:
                (await readAppliedAgentConfiguration(input.agentRoot))?.reasoningEffort ?? 'medium',
            drainItemIds: command.drainItemIds ?? [],
            inbox: command.inbox ?? [],
            inboxDelivery: command.inboxDelivery,
            onStoredNoticeDelivered: input.onStoredNoticeDelivered,
            activity: input.activity,
            thoughts: input.thoughts,
            registerNoticeSink: input.registerNoticeSink,
            runtime: input.runtime,
            runId: command.runId,
            runtimeId: command.runtimeId,
            sessionGeneration: command.sessionGeneration,
            signal: input.signal,
            serverId: input.serverId,
            skillsDir: input.dirs.skills,
            totalPending: command.totalPending,
            unreadElsewhere: command.unreadElsewhere ?? [],
            warmDrainItemIds: command.warmDrainItemIds ?? [],
            webAccess: command.webAccess ?? null,
            workspaceDir: input.dirs.workspace,
            tools: input.tools,
        });
        await writeTrace(input, 'Harness turn completed.\n');
        return settledTurnOutcome(turn);
    } catch (error) {
        await writeTrace(input, `Harness turn failed: ${messageOf(error)}\n`);
        return await reportHarnessTurnFailure(input.runtime, command, error, input.signal);
    }
}
