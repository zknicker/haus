#!/usr/bin/env bun
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { arch, homedir, platform, userInfo } from 'node:os';
import { join } from 'node:path';
import type { AgentSkillImportCommand, AgentSkillImportRecord } from '@haus/api';
import * as commandFrames from './agent-command-frames.ts';
import { handleAgentResetFrame } from './agent-reset-frames.ts';
import {
    parseAgentRetireCommand,
    purgeRetiredAgent,
    reportRetirementError,
} from './agent-retirement.ts';
import { handleAgentSkillFileRequest } from './agent-skill-files.ts';
import { AttachmentConnectionWork } from './attachment-connection-work.ts';
import { type AttachmentConnectionOutcome, runAttachmentDaemon } from './attachment-daemon-loop.ts';
import {
    AttachmentDaemonProcessRegistry,
    attachmentCredentialHash as hash,
    readAttachmentDaemonMarker,
} from './attachment-daemon-process.ts';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { type AttachmentHeartbeat, startAttachmentHeartbeat } from './attachment-heartbeat.ts';
import {
    recordManagementCommandForAttachments,
    sendSystemEventReport,
} from './attachment-management-reports.ts';
import {
    archiveUnlinkedAttachment,
    clearTerminalUnlinked,
    isTerminalUnlinked,
    markTerminalUnlinked,
} from './attachment-recovery.ts';
import {
    drainAttachmentDaemon,
    stopAttachmentProcess,
    withAttachmentShutdown,
} from './attachment-shutdown.ts';
import {
    getOrCreatePendingAttachment,
    readPendingAttachment,
    removePendingAttachment,
} from './attachment-state.ts';
import { createAttachmentStore } from './attachment-store.ts';
import { recordAttachmentManagementEvent } from './attachment-system-event-outbox.ts';
import { runAttachmentUpdate } from './attachment-update.ts';
import { handleWorkerFrame } from './attachment-workers.ts';
import type { Attachment } from './attachment.ts';
import { handleBrowserRequest } from './browser/requests.ts';
import { reconcileComputerBrowser } from './browser/settings.ts';
import {
    computerAttachmentDaemonEntrypoint,
    computerEntrypoint,
    computerSourceRevision,
    computerVersion,
} from './build-identity.ts';
import { printComputerHeader, printComputerHelpPage } from './cli/chrome.ts';
import { findComputerCommandHelp, resolveComputerHelpRequest } from './cli/help.ts';
import { cliColorsEnabled, createCliRenderer, stdoutRenderer } from './cli/render.ts';
import { sendComputerDiskReport } from './computer-disk.ts';
import { readComputerName } from './computer-name.ts';
import { startComputerReportSchedule } from './computer-report-schedule.ts';
import { createComputerReporter, reportStateError } from './computer-report.ts';
import { guardDevDaemonMemory } from './daemon-memory-guard.ts';
import { type DaemonRuntime, withDaemonRuntime } from './daemon-runtime.ts';
import {
    doctorComputer,
    formatComputerStatus,
    formatDoctor,
    readComputerLogs,
    readComputerStatus,
} from './diagnostics.ts';
import { handleHostSkillFileRequest } from './host-skill-file.ts';
import {
    acceptHostSkillImport,
    finishHostSkillImport,
    importHostSkill,
    listAcceptedHostSkillImports,
    parseAgentSkillImportCommand,
} from './host-skills.ts';
import { runInternalCommand } from './internal-commands.ts';
import { handleInventoryRefresh } from './inventory-refresh.ts';
import { attachmentInvocations } from './invocations/attachment-invocations.ts';
import {
    computerServiceLabel,
    replaceLaunchdService,
    restartLaunchdService,
    runsInsideLaunchdJob,
} from './launchd.ts';
import {
    completeComputerLogin,
    ensureComputerLoginSession,
    readComputerLoginSession,
    resolveComputerLogin,
    revokeComputerLoginSession,
    runComputerLogin,
} from './login.ts';
import { parseReminderScriptCommand, runReminderScript } from './reminder-script.ts';
import { runtimeSearchPath } from './runtime-discovery.ts';
import { handleComputerSecretsRequest } from './secrets/requests.ts';
import { deleteServerPartition } from './server-partition-purge.ts';
import {
    computerBootstrapProtocolVersion,
    computerProtocolVersion,
    parseBootstrapAccepted,
    parseComputerHeartbeatAck,
    parseComputerHeartbeatConfiguration,
    parseComputerUpdateCommand,
} from './update-contract.ts';
import { finishRestart, recoverInterruptedUpdate } from './update-recovery.ts';
import {
    isNewerVersion,
    readProductionRelease,
    readUpdateProgress,
    rollbackComputer,
    runSignedUpdate,
} from './update.ts';
import { createUpgradeRenderer, describeConcurrentUpdate } from './upgrade-render.ts';
import { saveOpenRouterManagementKey } from './usage/openrouter-settings.ts';
import { createUsageReporter } from './usage/report.ts';
import { startCloudAgentModelCatalogRefresh } from './workers/model-catalog.ts';
import { WorkerSupervisor } from './workers/work-runner.ts';
import { handleAgentWorkspaceRequest } from './workspace-files.ts';
import { runWorkspaceMaintenance } from './workspace-volumes/command.ts';

interface AttachResponse {
    computerId: string;
    idempotent: boolean;
    serverId: string;
    slug: string;
}

const dataRoot = process.env.HAUS_COMPUTER_DATA_ROOT ?? join(homedir(), '.haus', 'computer');
const sendComputerReport = createComputerReporter(dataRoot);
const sendUsageReport = createUsageReporter(dataRoot);
const serverOrigin = process.env.HAUS_SERVER_ORIGIN ?? 'https://haus.chat';
const { findAttachment, listAttachments, readAttachment } = createAttachmentStore(dataRoot);
const attachmentDaemonProcesses = new AttachmentDaemonProcessRegistry();

const headerCommands: Record<string, { updateStatus: boolean }> = {
    attach: { updateStatus: false },
    'configure-openrouter': { updateStatus: false },
    doctor: { updateStatus: true },
    install: { updateStatus: false },
    login: { updateStatus: false },
    logout: { updateStatus: false },
    logs: { updateStatus: false },
    restart: { updateStatus: false },
    setup: { updateStatus: false },
    start: { updateStatus: false },
    status: { updateStatus: true },
    stop: { updateStatus: false },
    upgrade: { updateStatus: false },
};

async function main(args: string[]) {
    const [command, target] = args;
    if (await runInternalCommand(args)) {
        return;
    }
    const helpRequest = resolveComputerHelpRequest(args);
    if (helpRequest) {
        await printComputerHelpPage(helpRequest, { dataRoot });
        return;
    }
    if (command === 'workspace-migrate' || command === 'workspace-compact') {
        const result = await runWorkspaceMaintenance({
            command,
            dataRoot,
            target,
            agentId: args[2],
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    const headerPrinted =
        command !== undefined && command in headerCommands
            ? await printComputerHeader({
                  dataRoot,
                  updateStatus: headerCommands[command]?.updateStatus === true,
              })
            : false;
    if (command === 'install') {
        await installResidentService();
        console.log(stdoutRenderer.ok('Haus Computer resident service installed.'));
        return;
    }
    if (command === 'upgrade') {
        if (target === '--rollback') {
            await rollbackComputer({
                onPhase: (phase) => {
                    console.log(
                        phase === 'restoring'
                            ? 'Restoring the previous verified Haus Computer executable…'
                            : 'Restarting Haus Computer…'
                    );
                },
                restart: restartAfterUpdate,
            });
            await recordManagementCommandForAttachments(dataRoot, 'rollback');
            console.log(
                stdoutRenderer.ok('Haus Computer restored the previous verified executable.')
            );
            return;
        }
        console.log('Checking for the latest Haus Computer release…');
        const release = await readProductionRelease();
        if (!isNewerVersion(release.release.version, computerVersion)) {
            console.log(
                stdoutRenderer.ok(`Haus Computer ${computerVersion} is already the latest release.`)
            );
            return;
        }
        const renderer = createUpgradeRenderer({
            isTTY: process.stdout.isTTY === true,
            write: (text) => process.stdout.write(text),
        });
        const outcome = await runSignedUpdate({
            dataRoot,
            onProgress: (update) => renderer.observe(update),
            release,
            restart: restartAfterUpdate,
        });
        renderer.finish();
        if (outcome.status === 'already-running') {
            console.log(stdoutRenderer.warn(describeConcurrentUpdate(outcome.progress)));
            return;
        }
        await recordManagementCommandForAttachments(dataRoot, 'upgrade');
        console.log(
            stdoutRenderer.ok(
                `Haus Computer ${outcome.version} is installed. The Computer service is restarting.`
            )
        );
        return;
    }
    if (command === '--version' || command === 'version') {
        // The signed-release updater parses piped JSON; only a TTY gets presentation.
        if (process.stdout.isTTY === true) {
            console.log(
                `${stdoutRenderer.header({ version: computerVersion })} ${stdoutRenderer.hint(
                    `protocol ${computerProtocolVersion} · revision ${computerSourceRevision}`
                )}`
            );
            return;
        }
        console.log(
            JSON.stringify({
                protocolVersion: computerProtocolVersion,
                sourceRevision: computerSourceRevision,
                version: computerVersion,
            })
        );
        return;
    }
    if (command === 'status') {
        console.log(formatComputerStatus(await readComputerStatus(dataRoot), stdoutRenderer));
        return;
    }
    if (command === 'doctor') {
        const result = await doctorComputer(dataRoot, validate);
        console.log(formatDoctor(result, stdoutRenderer));
        if (!result.healthy) {
            process.exitCode = 1;
        }
        return;
    }
    if (command === 'logs') {
        const requestedLines = Number.parseInt(target ?? '200', 10);
        process.stdout.write(
            await readComputerLogs(
                dataRoot,
                Number.isSafeInteger(requestedLines) ? requestedLines : 200
            )
        );
        return;
    }
    if (command === 'configure-openrouter') {
        await saveOpenRouterManagementKey(dataRoot, await Bun.stdin.text());
        console.log(
            stdoutRenderer.ok('OpenRouter account usage is configured on this Haus Computer.')
        );
        return;
    }
    if (command === 'login') {
        await runComputerLogin({
            dataRoot,
            replace: target === '--replace',
            serverOrigin,
        });
        return;
    }
    if (command === 'logout') {
        const session = await readComputerLoginSession(dataRoot);
        let revocationFailure: unknown;
        try {
            if (session) {
                await revokeComputerLoginSession(session);
            }
        } catch (cause) {
            revocationFailure = cause;
        }
        await rm(join(dataRoot, 'login.json'), { force: true });
        await stopComputerService();
        if (revocationFailure) {
            const detail =
                revocationFailure instanceof Error
                    ? revocationFailure.message
                    : String(revocationFailure);
            throw new Error(
                `Haus Computer logged out locally, but Server-side revocation failed: ${detail}`
            );
        }
        console.log(stdoutRenderer.ok('Haus Computer logged out.'));
        return;
    }
    if (command === 'start') {
        await recoverInterruptedUpdate(dataRoot);
        await finishRestart(dataRoot);
        await rm(stoppedPath(), { force: true });
        const targetAttachment = target ? await requiredAttachment(target) : null;
        if (targetAttachment && (await reportUnlinkedAttachment(targetAttachment))) {
            return;
        }
        await startAttachments(target);
        if (targetAttachment) {
            await recordAttachmentManagementEvent(dataRoot, targetAttachment.serverId, 'start');
        } else {
            await recordManagementCommandForAttachments(dataRoot, 'start');
        }
        if (process.env.HAUS_COMPUTER_RESIDENT === '1') {
            for (;;) {
                await Bun.sleep(500);
                try {
                    await startAttachments(target);
                } catch (error) {
                    // The resident supervisor must outlive transient respawn failures.
                    console.error(error instanceof Error ? error.message : String(error));
                }
            }
        }
        console.log(stdoutRenderer.ok(target ? `Started ${target}.` : 'Haus Computer started.'));
        return;
    }
    if (command === 'stop') {
        if (target) {
            const attachment = await requiredAttachment(target);
            await stopAttachmentDaemon(attachment);
            await recordAttachmentManagementEvent(dataRoot, attachment.serverId, 'stop');
            console.log(stdoutRenderer.ok(`Stopped ${target}.`));
            return;
        }
        await stopComputerService();
        await recordManagementCommandForAttachments(dataRoot, 'stop');
        console.log(stdoutRenderer.ok('Haus Computer stopped.'));
        return;
    }
    if (command === 'restart') {
        if (!target) {
            await printIncompleteCommand('restart', headerPrinted);
            return;
        }
        const attachment = await requiredAttachment(target);
        if (await reportUnlinkedAttachment(attachment)) {
            return;
        }
        await stopAttachmentDaemon(attachment);
        await startAttachmentDaemon(attachment);
        await recordAttachmentManagementEvent(dataRoot, attachment.serverId, 'restart');
        console.log(stdoutRenderer.ok(`Restarted /${attachment.slug}.`));
        return;
    }
    if (command === '__attachment-daemon') {
        const attachment = await readAttachment(target);
        if (!attachment) {
            throw new Error('This Server is not attached to this Haus Computer.');
        }
        await finishRestart(dataRoot);
        guardDevDaemonMemory(attachment.slug);
        process.exitCode = await withDaemonRuntime(async (runtime) => {
            const partition = { dataRoot, serverId: attachment.serverId };
            const workers = new WorkerSupervisor(runtime, { ...partition, server: attachment });
            const daemonWork = new AttachmentDaemonWork(runtime, workers);
            return withAttachmentShutdown(daemonWork, runtime, partition, () =>
                runAttachmentDaemon(runtime, {
                    attachmentExists: async () => (await readAttachment(target)) !== null,
                    connect: () => connect(attachment, runtime, daemonWork),
                    isTerminalUnlinkedError: isComputerMachineUnlinked,
                    log: (message) => console.error(`/${attachment.slug}: ${message}`),
                    markTerminalUnlinked: () => markTerminalUnlinked(dataRoot, attachment),
                    oneshot: process.env.HAUS_COMPUTER_ONESHOT === '1',
                    validate: () => validate(attachment),
                })
            );
        });
        return;
    }
    if (command === 'attach') {
        if (!target?.startsWith('/')) {
            await printIncompleteCommand('attach', headerPrinted);
            return;
        }
        await attachServer(serverSlugFromTarget(target));
        return;
    }
    if (command !== 'setup') {
        await printComputerHelpPage(
            { error: `Unknown command "${command}".`, kind: 'global' },
            { dataRoot }
        );
        return;
    }
    if (!target?.startsWith('/')) {
        await printIncompleteCommand('setup', headerPrinted);
        return;
    }
    const slug = serverSlugFromTarget(target);
    const current = await findAttachment(slug);
    if (current) {
        try {
            await validate(current);
            await clearTerminalUnlinked(dataRoot, current);
            const pending = await readPendingAttachment(dataRoot, slug);
            if (pending) {
                const session = await readComputerLoginSession(dataRoot);
                if (session?.origin === pending.origin) {
                    await completeComputerLogin(
                        await ensureComputerLoginSession({ dataRoot, session })
                    );
                }
            }
            await removePendingAttachment(dataRoot, slug);
            await startAttachmentDaemon(current);
            console.log(stdoutRenderer.ok(`Haus Computer resumed /${slug}.`));
            return;
        } catch (error) {
            if (!isComputerMachineUnlinked(error)) {
                throw error;
            }
        }
    }
    await setupServer(slug, current);
}

/**
 * A terminally unlinked attachment never starts its daemon, so start/restart
 * must report the setup path instead of claiming success.
 */
async function reportUnlinkedAttachment(attachment: Attachment): Promise<boolean> {
    if (!(await isTerminalUnlinked(dataRoot, attachment))) {
        return false;
    }
    console.log(
        stdoutRenderer.fail(
            `/${attachment.slug} needs setup — run haus-computer setup /${attachment.slug}.`
        )
    );
    process.exitCode = 1;
    return true;
}

async function printIncompleteCommand(name: string, omitHeader: boolean) {
    const command = findComputerCommandHelp(name);
    if (!command) {
        throw new Error(`Unknown command "${name}".`);
    }
    await printComputerHelpPage(
        { command, error: `${name} needs a Server address such as /hq.`, kind: 'command' },
        { dataRoot, omitHeader }
    );
}

function serverSlugFromTarget(target: string) {
    const slug = target.slice(1);
    if (slug.length < 2 || slug.length > 32 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(slug)) {
        throw new Error('A Server address uses 2–32 lowercase letters, numbers, and hyphens.');
    }
    return slug;
}

async function attachServer(slug: string) {
    const session = await resolveComputerLogin({
        allowLogin: false,
        dataRoot,
        serverOrigin,
    });
    const current = await findAttachment(slug);
    if (current) {
        await validate(current);
        await clearTerminalUnlinked(dataRoot, current);
        await removePendingAttachment(dataRoot, slug);
        await startAttachmentDaemon(current);
        console.log(stdoutRenderer.ok(`Haus Computer resumed /${slug}.`));
        return;
    }
    const issued = await issueAttachment(slug, session);
    await writeAttachment(issued.attachment);
    await removePendingAttachment(dataRoot, slug);
    await startAttachmentDaemon(issued.attachment);
    console.log(stdoutRenderer.ok(`Haus Computer attached to /${slug}.`));
}

async function setupServer(slug: string, current: Attachment | null) {
    let session = await resolveComputerLogin({
        allowLogin: true,
        complete: false,
        dataRoot,
        purpose: 'setup',
        serverOrigin,
    });

    let issued: Awaited<ReturnType<typeof issueAttachment>>;
    try {
        issued = await issueAttachment(slug, session);
    } catch (cause) {
        if (!isComputerLoginRequestFailure(cause)) {
            throw cause;
        }
        session = await runComputerLogin({
            complete: false,
            dataRoot,
            purpose: 'setup',
            replace: true,
            serverOrigin,
        });
        issued = await issueAttachment(slug, session);
    }

    if (current) {
        await stopAttachmentDaemon(current);
        const archivedPath = await archiveUnlinkedAttachment(dataRoot, current);
        console.log(`Archived the stale Computer attachment at ${archivedPath}.`);
    }
    await writeAttachment(issued.attachment);
    await completeComputerLogin(session);
    await removePendingAttachment(dataRoot, slug);
    await startAttachmentDaemon(issued.attachment);
    console.log(stdoutRenderer.ok(`Haus Computer attached to /${slug}.`));
}

async function issueAttachment(
    slug: string,
    session: Awaited<ReturnType<typeof resolveComputerLogin>>
) {
    const pending = await getOrCreatePendingAttachment({
        dataRoot,
        origin: session.origin,
        slug,
    });
    const response = await request<AttachResponse>(
        '/computer/attach',
        {
            accessToken: session.accessToken,
            credentialHash: hash(pending.credential),
            idempotencyKey: pending.idempotencyKey,
            slug,
        },
        session.origin
    );
    if (
        typeof response.computerId !== 'string' ||
        typeof response.serverId !== 'string' ||
        response.slug !== slug ||
        typeof response.idempotent !== 'boolean'
    ) {
        throw new Error('Server returned an invalid Computer attachment.');
    }
    return {
        attachment: {
            computerId: response.computerId,
            credential: pending.credential,
            serverId: response.serverId,
            serverOrigin: session.origin,
            slug,
        } satisfies Attachment,
        pending,
    };
}

function isComputerLoginRequestFailure(cause: unknown) {
    return (
        cause instanceof ComputerRequestError &&
        (cause.status === 401 || cause.code?.startsWith('computer_login_') === true)
    );
}

async function startAttachments(target: string | undefined) {
    if (await isStopped()) {
        return;
    }
    if (target) {
        await startAttachmentDaemon(await requiredAttachment(target));
        return;
    }
    await Promise.all((await listAttachments()).map(startAttachmentDaemon));
}

async function requiredAttachment(target: string | undefined) {
    if (!target?.startsWith('/')) {
        throw new Error('Choose a Server as /server-slug.');
    }
    const attachment = await findAttachment(target.slice(1));
    if (!attachment) {
        throw new Error(`This Haus Computer is not attached to ${target}.`);
    }
    return attachment;
}

async function validate(attachment: Attachment) {
    await request(
        '/computer/validate',
        { credentialHash: hash(attachment.credential), serverId: attachment.serverId },
        attachment.serverOrigin
    );
}

async function request<Response>(
    path: string,
    body: object,
    origin = serverOrigin
): Promise<Response> {
    const response = await fetch(new URL(path, origin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'error',
    });
    let payload: Response & { code?: string; error?: string };
    try {
        payload = (await response.json()) as Response & { code?: string; error?: string };
    } catch {
        payload = {} as Response & { code?: string; error?: string };
    }
    if (!response.ok) {
        throw new ComputerRequestError(
            payload.error ?? 'Computer request was rejected.',
            payload.code,
            response.status
        );
    }
    return payload;
}

class ComputerRequestError extends Error {
    constructor(
        message: string,
        readonly code: string | undefined,
        readonly status: number
    ) {
        super(message);
        this.name = 'ComputerRequestError';
    }
}

function isComputerMachineUnlinked(error: unknown): boolean {
    return (
        error instanceof ComputerRequestError &&
        error.status === 403 &&
        error.code === 'computer_machine_unlinked'
    );
}

async function writeAttachment(attachment: Attachment) {
    const directory = join(dataRoot, 'servers', attachment.serverId);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const destination = join(directory, 'attachment.json');
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(attachment)}\n`, { mode: 0o600 });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}

function stoppedPath() {
    return join(dataRoot, 'stopped');
}

async function isStopped() {
    try {
        await readFile(stoppedPath());
        return true;
    } catch {
        return false;
    }
}

async function stopComputerService() {
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await writeFile(stoppedPath(), '', { mode: 0o600 });
    await Promise.all((await listAttachments()).map(stopAttachmentDaemon));
    await stopResidentService();
}

async function startAttachmentDaemon(attachment: Attachment) {
    if (await isTerminalUnlinked(dataRoot, attachment)) {
        return;
    }
    const marker = await readAttachmentDaemonMarker(attachmentDaemonPath(attachment));
    const plan = await attachmentDaemonProcesses.planStart(
        marker,
        hash(attachment.credential),
        attachment.serverId
    );
    if (plan.kind === 'retain') {
        return;
    }
    if (plan.kind === 'restart') {
        await stopAttachmentProcess(plan.pid);
    }
    const entrypoint = computerAttachmentDaemonEntrypoint(attachment.serverId, {
        watch: process.env.HAUS_COMPUTER_WATCH_ATTACHMENT_DAEMON === '1',
    });
    const child = Bun.spawn([entrypoint.executable, ...entrypoint.args], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ATTACHMENT_DAEMON: '1',
        },
        stderr: 'inherit',
        stdin: 'ignore',
        stdout: 'inherit',
    });
    await writeFile(
        attachmentDaemonPath(attachment),
        `${JSON.stringify({ credentialHash: hash(attachment.credential), pid: child.pid })}\n`,
        { mode: 0o600 }
    );
    attachmentDaemonProcesses.recordStarted(attachment.serverId, child.pid);
    // The durable marker and resident supervisor own the daemon, not this command.
    child.unref();
    void child.exited.then(async () => {
        attachmentDaemonProcesses.recordExited(attachment.serverId, child.pid);
        const marker = await readAttachmentDaemonMarker(attachmentDaemonPath(attachment));
        if (marker?.pid === child.pid) {
            await rm(attachmentDaemonPath(attachment), { force: true });
        }
    });
}

async function stopAttachmentDaemon(attachment: Attachment) {
    const marker = await readAttachmentDaemonMarker(attachmentDaemonPath(attachment));
    const pid = await attachmentDaemonProcesses.verifiedPid(marker, attachment.serverId);
    if (pid) {
        await stopAttachmentProcess(pid);
    }
    await rm(attachmentDaemonPath(attachment), { force: true });
}

function attachmentDaemonPath(attachment: Attachment) {
    return join(dataRoot, 'servers', attachment.serverId, 'attachment-daemon.pid');
}

async function installResidentService() {
    replaceLaunchdService(await writeResidentService());
}

async function restartResidentService() {
    restartLaunchdService({
        ...(await writeResidentService()),
        insideJob: runsInsideLaunchdJob(computerServiceLabel, process.env),
    });
}

async function writeResidentService() {
    const agentsRoot = join(homedir(), 'Library', 'LaunchAgents');
    const plistPath = join(agentsRoot, `${computerServiceLabel}.plist`);
    await mkdir(agentsRoot, { recursive: true });
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await mkdir(join(dataRoot, 'logs'), { mode: 0o700, recursive: true });
    const plist = launchdPlist(computerEntrypoint());
    // An in-job kickstart keeps the loaded definition; a changed plist applies at the next load.
    if ((await readFile(plistPath, 'utf8').catch(() => null)) !== plist) {
        await writeFile(plistPath, plist, { mode: 0o600 });
    }
    return {
        domain: `gui/${userInfo().uid}`,
        label: computerServiceLabel,
        plistPath,
        run: (args: string[]) =>
            Bun.spawnSync(['/bin/launchctl', ...args], {
                stderr: 'ignore',
                stdout: 'ignore',
            }).exitCode,
    };
}

async function stopResidentService() {
    if (platform() !== 'darwin') {
        return;
    }
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${computerServiceLabel}.plist`);
    if (!(await stat(plistPath).catch(() => null))) {
        return;
    }
    const result = Bun.spawnSync(['/bin/launchctl', 'bootout', `gui/${userInfo().uid}`, plistPath]);
    if (result.exitCode !== 0 && result.exitCode !== 3) {
        throw new Error('Could not stop Haus Computer service.');
    }
}

async function restartAfterUpdate() {
    await drainAttachmentDaemon();
    for (const attachment of await listAttachments()) {
        const marker = await readAttachmentDaemonMarker(attachmentDaemonPath(attachment));
        const pid = await attachmentDaemonProcesses.verifiedPid(marker, attachment.serverId);
        if (pid && pid !== process.pid) {
            await stopAttachmentProcess(pid);
        }
        await rm(attachmentDaemonPath(attachment), { force: true });
    }
    await restartResidentService();
    if (process.env.HAUS_COMPUTER_ATTACHMENT_DAEMON === '1') {
        process.exit(0);
    }
}

export function launchdPlist(entrypoint: { args: string[]; executable: string }) {
    const escaped = [entrypoint.executable, ...entrypoint.args, 'start', dataRoot].map(escapeXml);
    const programArguments = escaped
        .slice(0, -1)
        .map((value) => `<string>${value}</string>`)
        .join('');
    const logPath = escapeXml(join(dataRoot, 'logs', 'computer.log'));
    const path = escapeXml(runtimeSearchPath());
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${computerServiceLabel}</string><key>ProgramArguments</key><array>${programArguments}</array><key>EnvironmentVariables</key><dict><key>HAUS_COMPUTER_DATA_ROOT</key><string>${escaped.at(-1)}</string><key>HAUS_COMPUTER_RESIDENT</key><string>1</string><key>PATH</key><string>${path}</string></dict><key>StandardOutPath</key><string>${logPath}</string><key>StandardErrorPath</key><string>${logPath}</string><key>KeepAlive</key><true/><key>RunAtLoad</key><true/></dict></plist>\n`;
}

function escapeXml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

async function connect(
    attachment: Attachment,
    runtime: DaemonRuntime,
    daemonWork: AttachmentDaemonWork
): Promise<AttachmentConnectionOutcome> {
    const browserRoot = join(dataRoot, 'servers', attachment.serverId, 'browser');
    const agentsDir = join(dataRoot, 'servers', attachment.serverId, 'agents');
    void reconcileComputerBrowser(browserRoot, runtime).catch((error) => {
        console.error(error instanceof Error ? error.message : error);
    });
    const socketUrl = new URL('/computer/attachment', attachment.serverOrigin);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const [initialProgress, computerName] = await Promise.all([
        readUpdateProgress(dataRoot),
        readComputerName(),
    ]);
    const connectionWork = await AttachmentConnectionWork.make(runtime);
    const socket = new WebSocket(socketUrl);
    const invocations = attachmentInvocations(dataRoot, attachment, daemonWork);
    const { resettingAgents, retiredAgents } = daemonWork;
    let deleting = false;
    let deletionPromise: Promise<void> | null = null;
    let detachSender: () => void = () => undefined;
    const sendFrame = (frame: unknown) => daemonWork.send(frame);
    const trackWriter = <Result>(operation: Promise<Result>) => daemonWork.track(operation);
    const reportComputer = (recheckAuthentication = false) =>
        sendComputerReport(sendFrame, attachment.serverId, computerName, recheckAuthentication);
    const sendSkillImportRecord = (record: AgentSkillImportRecord) => {
        sendFrame({ ...record, type: 'agent-skill-import-result' });
    };
    const applyAcceptedSkillImport = async (
        record: Extract<AgentSkillImportRecord, { status: 'accepted' }>
    ) => {
        let settled: AgentSkillImportRecord;
        try {
            const skill = await importHostSkill({
                agentId: record.agentId,
                dataRoot,
                serverId: attachment.serverId,
                sourceId: record.sourceId,
            });
            settled = await finishHostSkillImport({
                dataRoot,
                record: {
                    agentId: record.agentId,
                    requestId: record.requestId,
                    skill,
                    sourceId: record.sourceId,
                    status: 'applied',
                },
                serverId: attachment.serverId,
            });
        } catch (error) {
            settled = await finishHostSkillImport({
                dataRoot,
                record: {
                    agentId: record.agentId,
                    error: safeSkillImportError(error),
                    requestId: record.requestId,
                    sourceId: record.sourceId,
                    status: 'failed',
                },
                serverId: attachment.serverId,
            });
        }
        sendSkillImportRecord(settled);
        await sendComputerReport(sendFrame, attachment.serverId, computerName);
    };
    const acceptSkillImport = async (command: AgentSkillImportCommand) => {
        const record = await acceptHostSkillImport({
            command,
            dataRoot,
            serverId: attachment.serverId,
        });
        sendSkillImportRecord(record);
        await sendComputerReport(sendFrame, attachment.serverId, computerName);
        if (record.status === 'accepted') {
            await applyAcceptedSkillImport(record);
        }
    };
    let lastProgress = JSON.stringify(initialProgress);
    let heartbeat: AttachmentHeartbeat | null = null;
    let reportLoopsStarted = false;
    connectionWork.startLoop(
        500,
        async () => {
            const update = await readUpdateProgress(dataRoot);
            const serialized = JSON.stringify(update);
            if (serialized === lastProgress || socket.readyState !== WebSocket.OPEN) {
                return;
            }
            lastProgress = serialized;
            sendFrame({ type: 'update-progress', update });
        },
        reportStateError
    );
    let opened = false;
    return await new Promise<AttachmentConnectionOutcome>((resolve) => {
        socket.addEventListener('close', () => {
            detachSender();
            heartbeat?.dispose();
            void Promise.allSettled([
                connectionWork.close(),
                daemonWork.workers?.detach(),
                deletionPromise ?? Promise.resolve(),
            ]).finally(() => {
                resolve({ connected: opened, deleted: deleting });
            });
        });
        socket.addEventListener('error', () => {
            heartbeat?.dispose();
        });
        const handleMessage = (event: MessageEvent) => {
            const frame = JSON.parse(String(event.data)) as { type?: string };
            const heartbeatConfiguration = parseComputerHeartbeatConfiguration(frame);
            if (heartbeatConfiguration) {
                heartbeat?.dispose();
                heartbeat = startAttachmentHeartbeat({
                    configuration: heartbeatConfiguration,
                    onTimeout: () => undefined,
                    runtime,
                    socket,
                });
                return;
            }
            const heartbeatAck = parseComputerHeartbeatAck(frame);
            if (heartbeatAck) {
                heartbeat?.acceptAck(heartbeatAck.id);
                return;
            }
            if (commandFrames.parseServerDeleteCommand(frame)) {
                deleting = true;
                deletionPromise = deleteServerPartition(daemonWork, {
                    dataRoot,
                    serverId: attachment.serverId,
                }).catch((error) => {
                    console.error(error instanceof Error ? error.message : error);
                });
                socket.close();
                return;
            }
            if (deleting) {
                return;
            }
            const bootstrap = parseBootstrapAccepted(frame);
            if (bootstrap) {
                sendFrame({ type: 'heartbeat-negotiate' });
                if (bootstrap.mode === 'ordinary') {
                    invocations.connected();
                    daemonWork.workers?.attach(sendFrame);
                    const initialReport = Promise.resolve().then(async () => {
                        await Promise.all([
                            sendComputerReport(sendFrame, attachment.serverId, computerName, true),
                            sendSystemEventReport(dataRoot, sendFrame, attachment.serverId),
                            sendComputerDiskReport(dataRoot, sendFrame),
                        ]);
                        const acceptedImports = await listAcceptedHostSkillImports(
                            dataRoot,
                            attachment.serverId
                        );
                        for (const record of acceptedImports) {
                            await applyAcceptedSkillImport(record);
                        }
                        if (process.env.HAUS_COMPUTER_USAGE_DISABLED !== '1') {
                            await sendUsageReport(sendFrame);
                        }
                    });
                    void trackWriter(initialReport.catch(reportStateError)).finally(() => {
                        if (process.env.HAUS_COMPUTER_ONESHOT === '1') {
                            socket.close();
                        }
                    });
                    if (!reportLoopsStarted) {
                        reportLoopsStarted = true;
                        startComputerReportSchedule(connectionWork, dataRoot, sendFrame, () =>
                            trackWriter(sendUsageReport(sendFrame))
                        );
                    }
                    startCloudAgentModelCatalogRefresh(connectionWork, () =>
                        trackWriter(reportComputer())
                    );
                    return;
                }
                if (process.env.HAUS_COMPUTER_ONESHOT === '1') {
                    socket.close();
                }
                return;
            }
            const update = parseComputerUpdateCommand(frame);
            if (
                handleInventoryRefresh(frame, {
                    send: sendFrame,
                    track: trackWriter,
                    refreshUsage: () => sendUsageReport(sendFrame, 'refresh'),
                    refreshReport: () => reportComputer(true),
                })
            ) {
                return;
            }
            if (update) {
                void runAttachmentUpdate({
                    dataRoot,
                    release: update.release,
                    restart: restartAfterUpdate,
                }).catch(console.error);
                return;
            }
            if (
                handleWorkerFrame(frame, {
                    runtime,
                    dataRoot,
                    workers: daemonWork.workers,
                    track: trackWriter,
                    send: sendFrame,
                    refresh: () => sendComputerReport(sendFrame, attachment.serverId, computerName),
                    onFailure: reportStateError,
                })
            ) {
                return;
            }
            const retirement = parseAgentRetireCommand(frame);
            if (retirement) {
                retiredAgents.add(retirement.agentId);
                void trackWriter(
                    purgeRetiredAgent({
                        agentId: retirement.agentId,
                        dataRoot,
                        serverId: attachment.serverId,
                    })
                        .catch((error) => reportRetirementError(retirement.agentId, error))
                        .then(() => reportComputer())
                        .catch(reportStateError)
                );
                return;
            }
            const skillImport = parseAgentSkillImportCommand(frame);
            if (skillImport) {
                void trackWriter(acceptSkillImport(skillImport).catch(reportStateError));
                return;
            }
            if (
                handleHostSkillFileRequest(frame, { send: sendFrame, track: trackWriter }) ||
                handleAgentSkillFileRequest(frame, {
                    dataRoot,
                    refreshReport: () => reportComputer(),
                    send: sendFrame,
                    serverId: attachment.serverId,
                    track: trackWriter,
                })
            ) {
                return;
            }
            const frameContext = {
                dataRoot,
                refreshReport: () => reportComputer(),
                runtime,
                send: sendFrame,
                serverId: attachment.serverId,
                track: trackWriter,
            };
            if (
                handleAgentWorkspaceRequest(frame, frameContext) ||
                handleBrowserRequest(frame, { ...frameContext, browserRoot }) ||
                handleComputerSecretsRequest(frame, frameContext)
            ) {
                return;
            }
            if (invocations.receive(frame)) {
                return;
            }
            if (
                handleAgentResetFrame(frame, {
                    agentsDir,
                    dataRoot,
                    report: () => reportComputer(),
                    resettingAgents,
                    retiredAgents,
                    serverId: attachment.serverId,
                    track: trackWriter,
                })
            ) {
                return;
            }
            const reminderScript = parseReminderScriptCommand(frame);
            if (reminderScript) {
                void trackWriter(
                    runReminderScript({
                        command: reminderScript,
                        dataRoot,
                        runtime,
                        serverId: attachment.serverId,
                    })
                        .then((result) => sendFrame(result))
                        .catch((error) => {
                            console.error(error instanceof Error ? error.message : error);
                        })
                );
            }
        };
        socket.addEventListener('message', (event) => {
            if (!daemonWork.isClosing) {
                handleMessage(event);
            }
        });
        socket.addEventListener('open', () => {
            opened = true;
            detachSender = daemonWork.attachSender({
                send(frame) {
                    if (socket.readyState !== WebSocket.OPEN) {
                        return false;
                    }
                    socket.send(JSON.stringify(frame));
                    return true;
                },
            });
            void readUpdateProgress(dataRoot).then((update) => {
                lastProgress = JSON.stringify(update);
                sendFrame({
                    architecture: arch(),
                    bootstrapProtocolVersion: computerBootstrapProtocolVersion,
                    credential: attachment.credential,
                    health: 'healthy',
                    operatingSystem: platform(),
                    productVersion: computerVersion,
                    protocolVersion: computerProtocolVersion,
                    type: 'bootstrap',
                    update,
                });
            });
        });
    });
}

function safeSkillImportError(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (
        message === 'That host skill is no longer available.' ||
        message === 'The imported skill could not be verified.' ||
        /^The Agent already has a skill named "[A-Za-z0-9_-]{1,128}"\.$/u.test(message)
    ) {
        return message;
    }
    return 'The skill could not be imported.';
}

if (import.meta.main) {
    try {
        await main(process.argv.slice(2));
    } catch (error) {
        const stderrRenderer = createCliRenderer({
            colors: cliColorsEnabled(process.env, process.stderr.isTTY === true),
        });
        console.error(stderrRenderer.fail(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
    }
}
