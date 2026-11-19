import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceCarrier } from '@haus/effect';
import type { AgentStartCommand, AgentTurnFrame } from './agent-commands.ts';
import { acquireAgentLaunchHost } from './agent-launch-host.ts';
import { agentPath } from './agent-path.ts';
import { createRunPresentation } from './agent-run-frames.ts';
import type { AgentTurnTimings } from './agent-turn-timings.ts';
import { computerEntrypoint } from './build-identity.ts';
import { createComputerTools } from './computer-tools.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { StoredNoticeReceipt } from './delivery.ts';
import { pullDriveBeforeTurn, pushDriveAfterTurn } from './drive/turn-sync.ts';
import type { NoticeSinkRegistrar, TurnDriverFactory } from './harness/executor.ts';
import { readRunVisibleMessages } from './inbox-store.ts';
import { prepareLaunchDrive } from './launch-drive.ts';
import {
    fakeRuntimeOutcome,
    runnerMintFailureReport,
    runtimeNotInstalledReport,
} from './launch-failure-turns.ts';
import { runFakeRuntime } from './launch-fake-runtime.ts';
import { runRealRuntime } from './launch-real-runtime.ts';
import { messageOf, writeTrace } from './launch-trace.ts';
import { reportTurn, turnSummaryText } from './launch-turn-report.ts';
import { mintRunner, revokeRunner } from './runner-authority.ts';
import { resolveRuntimeById } from './runtime-discovery.ts';
import { reportRuntimeOutcome } from './runtime-issues.ts';
import type { RuntimeTurnOutcome } from './turn-failure-report.ts';
import { type OpenTurnLedger, openTurnLedger } from './turn-ledger.ts';
import { visibilityReceipt } from './visibility-receipt.ts';
import type { WorkerSupervisor } from './workers/work-runner.ts';
import { ensureAgentWorkspace } from './workspace-volumes/workspace-volume.ts';
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
    workers?: WorkerSupervisor;
    command: AgentStartCommand;
    dataRoot: string;
    /** Commits the Server ack immediately before the runtime accepts the prompt. */
    onRuntimeReady?(): Promise<void>;
    /** Reports a persisted busy notice that was injected after sink registration. */
    onStoredNoticeDelivered?(receipt: StoredNoticeReceipt): void;
    /** Registers the live harness input used for content-free busy notices. */
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    /** Per-launch construction seam for deterministic runtime boundary tests. */
    runtimeDriverFactory?: TurnDriverFactory;
    /** Pushes the compact turn summary up the attachment socket. */
    sendFrame(frame: unknown): void;
    serverOrigin: string;
    /** Aborts the launch — a human Stop kills the live child through this. */
    signal?: AbortSignal;
    turnTimings?: AgentTurnTimings;
    turnTraceContext?: TraceCarrier;
}

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
        workspace: join(agentRoot, 'workspace'),
    };
    await Promise.all(
        [dirs.home, dirs.runtime].map((dir) => mkdir(dir, { mode: 0o700, recursive: true }))
    );
    const runtimeExecutable = resolveRuntimeById(command.runtimeId);
    if (command.runtimeId !== 'fake' && !runtimeExecutable && !options.runtimeDriverFactory) {
        return reportTurn(options, runtimeNotInstalledReport(command.runtimeId, startedAt));
    }
    if (command.runtimeId === 'fake' || options.runtimeDriverFactory) {
        await mkdir(dirs.workspace, { mode: 0o700, recursive: true });
    } else {
        await ensureAgentWorkspace({ agentRoot, dataRoot: options.dataRoot });
    }

    let runner: { runnerId: string; runnerToken: string };
    try {
        runner = await mintRunner(options);
    } catch (error) {
        await writeTrace({ command, dirs }, `Runner authority mint failed: ${messageOf(error)}\n`);
        return reportTurn(options, runnerMintFailureReport(error, startedAt));
    }
    const prepared = await prepareLaunchDrive({ agentRoot, dirs, options, runner, startedAt });
    if (!prepared.ok) {
        return reportTurn(options, prepared.report);
    }
    await pullDriveBeforeTurn(options, agentRoot, runner.runnerToken);

    const host = acquireAgentLaunchHost({
        agentId: command.agentId,
        workers: options.workers,
        dataRoot: options.dataRoot,
        runnerToken: runner.runnerToken,
        runId: command.runId,
        serverId: options.attachment.serverId,
        serverOrigin: options.serverOrigin,
        skillsDir: prepared.drive.skills,
    });
    const { proxy, proxyToken } = host;
    proxy.setTraceContext(options.turnTraceContext);
    proxy.setOnCommittedSend((send) => options.turnTimings?.recordSend(send));
    const { activity, thoughts } = createRunPresentation({
        ...command,
        ledger,
        runtime: options.runtime,
        sendFrame: options.sendFrame,
    });
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
        PATH: agentPath({ binDir, options, runtimeExecutable }),
    };

    let result: RuntimeTurnOutcome = { status: 'failed' };
    try {
        await options.onRuntimeReady?.();
        result =
            command.runtimeId === 'fake'
                ? fakeRuntimeOutcome(
                      await runFakeRuntime({ agentEnv, command, dirs, signal: options.signal })
                  )
                : await runRealRuntime({
                      attestVisible: visibilityReceipt(options.serverOrigin, runner.runnerToken),
                      turnTimings: options.turnTimings,
                      agentEnv,
                      agentRoot,
                      command,
                      dataRoot: options.dataRoot,
                      dirs,
                      drive: prepared.drive,
                      runtimeDriverFactory: options.runtimeDriverFactory,
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
        await pushDriveAfterTurn(options, agentRoot);
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
        summary: turnSummaryText(result, proxy.sendCount()),
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
