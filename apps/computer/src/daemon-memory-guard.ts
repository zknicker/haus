export const devDaemonMemoryLimitBytes = 2 * 1024 ** 3;

export function guardDevDaemonMemory(slug: string) {
    if (process.env.HAUS_DEV_STACK !== '1') {
        return;
    }
    watchDaemonMemory({
        intervalMs: 1000,
        limitBytes: devDaemonMemoryLimitBytes,
        onExceeded: (rssBytes) => {
            console.error(daemonMemoryExceededMessage(slug, rssBytes, devDaemonMemoryLimitBytes));
            process.exit(1);
        },
    });
}

export function watchDaemonMemory(options: {
    intervalMs: number;
    limitBytes: number;
    onExceeded: (rssBytes: number) => void;
}) {
    const timer = setInterval(() => {
        const rssBytes = process.memoryUsage.rss();
        if (rssBytes > options.limitBytes) {
            clearInterval(timer);
            options.onExceeded(rssBytes);
        }
    }, options.intervalMs);
    timer.unref();
    return () => clearInterval(timer);
}

export function daemonMemoryExceededMessage(slug: string, rssBytes: number, limitBytes: number) {
    const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
    return `/${slug}: the attachment daemon is using ${gigabytes(rssBytes)} GB of memory, over its ${gigabytes(limitBytes)} GB dev limit. Exiting so it cannot take the machine down; this is a memory leak to fix.`;
}
