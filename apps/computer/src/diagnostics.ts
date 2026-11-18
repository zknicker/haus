import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type CliRenderer, plainCliRenderer } from './cli/render.ts';
import type { Attachment } from './launch.ts';
import { readComputerLoginSession } from './login.ts';
import { validateComputerRuntimeAssets } from './runtime/runtime-assets.ts';

interface AttachmentStatus {
    daemon: 'running' | 'setup-required' | 'stopped';
    serverId: string;
    slug: string;
}

interface LoginStatus {
    origin: string | null;
    state: 'expired' | 'signed in' | 'signed out';
}

export async function readComputerStatus(dataRoot: string): Promise<{
    attachments: AttachmentStatus[];
    login: LoginStatus;
    service: 'running' | 'stopped';
}> {
    const stopped = await exists(join(dataRoot, 'stopped'));
    const attachments = await readAttachments(dataRoot);
    const login = await readComputerLoginSession(dataRoot);
    const refreshExpiresAt = login ? Date.parse(login.refreshTokenExpiresAt) : Number.NaN;
    return {
        attachments: await Promise.all(
            attachments.map(async (attachment) => {
                const marker = await readAttachmentDaemonMarker(dataRoot, attachment.serverId);
                const terminal = await readTerminalUnlinked(dataRoot, attachment);
                return {
                    daemon: terminal
                        ? 'setup-required'
                        : marker && isPidAlive(marker.pid)
                          ? 'running'
                          : 'stopped',
                    serverId: attachment.serverId,
                    slug: attachment.slug,
                };
            })
        ),
        login: login
            ? {
                  origin: login.origin,
                  state:
                      refreshExpiresAt > Date.now() ? ('signed in' as const) : ('expired' as const),
              }
            : { origin: null, state: 'signed out' as const },
        service: stopped ? 'stopped' : 'running',
    };
}

export async function doctorComputer(
    dataRoot: string,
    validate: (attachment: Attachment) => Promise<void>
): Promise<{ checks: { label: string; ok: boolean }[]; healthy: boolean }> {
    const checks: { label: string; ok: boolean }[] = [];
    const root = await stat(dataRoot).catch(() => null);
    checks.push({
        label: 'Data root exists and is private',
        ok: Boolean(root?.isDirectory() && (root.mode & 0o077) === 0),
    });
    const attachments = await readAttachments(dataRoot);
    checks.push({ label: 'At least one Server is attached', ok: attachments.length > 0 });
    checks.push({
        label: 'Bundled Agent runtimes are ready',
        ok: runtimeAssetsReady(),
    });
    for (const attachment of attachments) {
        const path = join(dataRoot, 'servers', attachment.serverId, 'attachment.json');
        const info = await stat(path).catch(() => null);
        checks.push({
            label: `/${attachment.slug} credential file is private`,
            ok: Boolean(info?.isFile() && (info.mode & 0o077) === 0),
        });
        checks.push({
            label: `/${attachment.slug} Server accepts this Computer`,
            ok: await validate(attachment)
                .then(() => true)
                .catch(() => false),
        });
    }
    return { checks, healthy: checks.every((check) => check.ok) };
}

export async function readComputerLogs(dataRoot: string, lines = 200): Promise<string> {
    const content = await readFile(join(dataRoot, 'logs', 'computer.log'), 'utf8').catch(() => '');
    return content
        .trimEnd()
        .split('\n')
        .slice(-Math.max(1, Math.min(lines, 2000)))
        .join('\n');
}

export function formatComputerStatus(
    status: Awaited<ReturnType<typeof readComputerStatus>>,
    render: CliRenderer = plainCliRenderer
) {
    const lines = [
        `Login     ${loginLine(status.login, render)}`,
        `Service   ${serviceLine(status.service, render)}`,
        'Servers',
    ];
    if (status.attachments.length === 0) {
        lines.push(
            `  ${render.hint('· No Servers attached — run haus-computer setup /server-slug')}`
        );
        return lines.join('\n');
    }
    const width = Math.max(...status.attachments.map((item) => item.slug.length + 1));
    for (const item of status.attachments) {
        lines.push(`  ${`/${item.slug}`.padEnd(width + 3)}${attachmentLine(item, render)}`);
    }
    return lines.join('\n');
}

export function formatDoctor(
    result: Awaited<ReturnType<typeof doctorComputer>>,
    render: CliRenderer = plainCliRenderer
) {
    const failed = result.checks.filter((check) => !check.ok).length;
    const verdict =
        failed === 0
            ? render.ok(`All ${result.checks.length} checks passed.`)
            : render.fail(`${failed} of ${result.checks.length} checks failed.`);
    return [
        ...result.checks.map((check) =>
            check.ok ? render.ok(check.label) : render.fail(check.label)
        ),
        '',
        verdict,
    ].join('\n');
}

function loginLine(login: LoginStatus, render: CliRenderer) {
    if (login.state === 'signed in') {
        return `${render.ok('signed in')}${login.origin ? ` — ${login.origin}` : ''}`;
    }
    if (login.state === 'expired') {
        return render.warn('expired — run haus-computer login');
    }
    return render.warn('signed out — run haus-computer login');
}

function serviceLine(service: 'running' | 'stopped', render: CliRenderer) {
    return service === 'running'
        ? render.ok('running')
        : render.warn('stopped — run haus-computer start');
}

function attachmentLine(item: AttachmentStatus, render: CliRenderer) {
    if (item.daemon === 'setup-required') {
        return render.fail(`setup required — run haus-computer setup /${item.slug}`);
    }
    const state =
        item.daemon === 'running'
            ? render.ok('running')
            : render.warn(`stopped — run haus-computer start /${item.slug}`);
    return `${state} ${render.hint(`(${item.serverId})`)}`;
}

async function readAttachments(dataRoot: string): Promise<Attachment[]> {
    const root = join(dataRoot, 'servers');
    const entries = await readdir(root).catch(() => []);
    const attachments = await Promise.all(
        entries.map(async (serverId) => {
            try {
                return JSON.parse(
                    await readFile(join(root, serverId, 'attachment.json'), 'utf8')
                ) as Attachment;
            } catch {
                return null;
            }
        })
    );
    return attachments
        .filter((item): item is Attachment => item !== null)
        .sort((left, right) => left.slug.localeCompare(right.slug));
}

async function readAttachmentDaemonMarker(dataRoot: string, serverId: string) {
    try {
        const value = JSON.parse(
            await readFile(join(dataRoot, 'servers', serverId, 'attachment-daemon.pid'), 'utf8')
        ) as { pid?: unknown };
        return typeof value.pid === 'number' ? { pid: value.pid } : null;
    } catch {
        return null;
    }
}

async function readTerminalUnlinked(dataRoot: string, attachment: Attachment) {
    try {
        const value = JSON.parse(
            await readFile(
                join(dataRoot, 'servers', attachment.serverId, 'terminal-unlinked.json'),
                'utf8'
            )
        ) as { computerId?: unknown; reason?: unknown };
        return (
            value.computerId === attachment.computerId &&
            value.reason === 'computer_machine_unlinked'
        );
    } catch {
        return false;
    }
}

function isPidAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function exists(path: string) {
    return await stat(path)
        .then(() => true)
        .catch(() => false);
}

function runtimeAssetsReady() {
    try {
        validateComputerRuntimeAssets();
        return true;
    } catch {
        return false;
    }
}
