const ansi = {
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    reset: '\x1b[0m',
    yellow: '\x1b[33m',
};

export const theme = {
    accent: ansi.cyan,
    danger: ansi.red,
    muted: ansi.dim,
    ok: ansi.green,
    warning: ansi.yellow,
};

const processOrder = ['postgres', 'storage', 'haus', 'computer', 'website', 'desktop'];

const sourceMeta = {
    desktop: { color: theme.accent, icon: '🪟', label: 'desktop' },
    computer: { color: theme.warning, icon: '🖥️', label: 'computer' },
    haus: { color: theme.warning, icon: '🏠', label: 'server' },
    postgres: { color: theme.warning, icon: '🐘', label: 'postgres' },
    storage: { color: theme.warning, icon: '🪣', label: 'files' },
    website: { color: theme.accent, icon: '🌐', label: 'website' },
};

const statusMeta = {
    disabled: { color: theme.muted, icon: '·', label: 'disabled' },
    error: { color: theme.danger, icon: '✕', label: 'error' },
    running: { color: theme.ok, icon: '✓', label: 'ready' },
    starting: { color: theme.warning, icon: '◐', label: 'starting' },
    stopped: { color: theme.muted, icon: '·', label: 'stopped' },
    stopping: { color: theme.warning, icon: '◐', label: 'stopping' },
    waiting: { color: theme.muted, icon: '·', label: 'waiting' },
};

export function formatHeader(snapshot, { colorize = false } = {}) {
    const lines = [
        formatHausLine('booting local stack', {
            color: theme.accent,
            colorize,
            icon: '🎰',
        }),
    ];

    if (snapshot.staleCleanupCount > 0) {
        lines.push(
            formatHausLine(`cleaned ${snapshot.staleCleanupCount} stale dev processes`, {
                color: theme.warning,
                colorize,
                icon: '◐',
            })
        );
    }

    return lines.join('\n');
}

export function formatLogLine(entry, { colorize = false } = {}) {
    const meta = getSourceMeta(entry.source);
    const prefix = formatSourcePrefix(meta, colorize);
    const message = colorizeSeverity(normalizeLine(entry.line), colorize);

    return `${prefix} ${message}`;
}

export function formatStatusLine(source, status, value, { colorize = false } = {}) {
    const meta = getSourceMeta(source);
    const tone = statusMeta[status] ?? statusMeta.waiting;
    const suffix = value ? ` ${dim(value, colorize)}` : '';
    const label = colorizeText(`${tone.icon} ${meta.label} ${tone.label}`, tone.color, colorize);

    return `${label}${suffix}`;
}

export function getSnapshotChangeLines(previous, next, snapshot, { colorize = false } = {}) {
    const lines = [];

    for (const source of processOrder) {
        const previousStatus = previous.processes[source];
        const nextStatus = next.processes[source];
        if (previousStatus !== nextStatus && shouldPrintStatus(nextStatus)) {
            lines.push(
                formatStatusLine(source, nextStatus, getStatusValue(source, nextStatus, snapshot), {
                    colorize,
                })
            );
        }
    }

    if (previous.phase !== next.phase && next.phase === 'running') {
        lines.push(formatReadyBlock(snapshot, { colorize }));
    }

    if (previous.staleCleanupCount !== next.staleCleanupCount && next.staleCleanupCount > 0) {
        lines.push(
            formatHausLine(`cleaned ${next.staleCleanupCount} stale dev processes`, {
                color: theme.warning,
                colorize,
                icon: '◐',
            })
        );
    }

    return lines;
}

export function formatReadyBlock(snapshot, { colorize = false } = {}) {
    const lines = [
        colorizeText('╭─ 🎰 HAUS', theme.accent, colorize),
        `${dim('│', colorize)}  ${colorizeText('Ready to go', theme.ok, colorize)}`,
        colorizeText('├─ Services', theme.accent, colorize),
        readyServiceLine('Server', snapshot.config.hausServerUrl, colorize),
        readyServiceLine('Computer', 'running', colorize),
        readyServiceLine('Website', snapshot.config.websiteUrl, colorize),
        readyServiceLine('Files', snapshot.config.objectStorageUrl ?? 'disabled', colorize),
        readyServiceLine(
            'Desktop',
            snapshot.config.desktopEnabled ? 'running' : 'disabled',
            colorize
        ),
        colorizeText('├─ Data', theme.accent, colorize),
        `${dim('│', colorize)}  ${dim('PG', colorize)}   ${snapshot.config.postgresDataPath}`,
        `${dim('│', colorize)}  ${dim('S3', colorize)}   ${snapshot.config.objectStoragePath}`,
        colorizeText('╰─', theme.accent, colorize),
    ];

    return lines.join('\n');
}

export function snapshotDigest(snapshot) {
    return {
        phase: snapshot.phase,
        processes: Object.fromEntries(
            Object.entries(snapshot.processes).map(([key, processState]) => [
                key,
                processState.status,
            ])
        ),
        staleCleanupCount: snapshot.staleCleanupCount,
    };
}

export function formatHausLine(message, { color, colorize, icon }) {
    return `${colorizeText(`${icon} haus`, color, colorize)} ${message}`;
}

function readyServiceLine(label, value, colorize) {
    return `${dim('│', colorize)}  ${colorizeText('✓', theme.ok, colorize)} ${label.padEnd(13, ' ')} ${dim(value, colorize)}`;
}

function shouldPrintStatus(status) {
    return (
        status === 'starting' || status === 'stopping' || status === 'error' || status === 'stopped'
    );
}

function getStatusValue(source, status, snapshot) {
    if (status === 'starting') {
        return '';
    }

    return getProcessValue(source, snapshot);
}

function getProcessValue(source, snapshot) {
    if (source === 'website') {
        return snapshot.config.websiteUrl;
    }

    if (source === 'desktop') {
        return snapshot.config.desktopEnabled ? 'enabled' : 'disabled';
    }
    if (source === 'haus') {
        return snapshot.config.hausServerUrl;
    }
    if (source === 'postgres') {
        return snapshot.config.postgresDataPath;
    }
    if (source === 'storage') {
        return snapshot.config.objectStorageUrl ?? '';
    }

    return '';
}

function formatSourcePrefix(meta, colorize) {
    const label = `${meta.icon} ${meta.label.padEnd(7, ' ')}`;
    return colorizeText(label, meta.color, colorize);
}

function getSourceMeta(source) {
    return (
        sourceMeta[source] ?? {
            color: theme.muted,
            icon: '·',
            label: source,
        }
    );
}

function normalizeLine(line) {
    return String(line).replace(/\s+/gu, ' ').trim();
}

function dim(value, colorize) {
    return colorizeText(value, theme.muted, colorize);
}

function colorizeText(value, code, colorize) {
    if (!colorize) {
        return value;
    }

    return `${code}${value}${ansi.reset}`;
}

function colorizeSeverity(line, colorize) {
    if (!colorize) {
        return line;
    }

    return line
        .replace(/\bFATAL\b/gu, colorizeText('FATAL', theme.danger, true))
        .replace(/\bERROR\b/gu, colorizeText('ERROR', theme.danger, true))
        .replace(/\bWARN\b/gu, colorizeText('WARN', theme.warning, true));
}
