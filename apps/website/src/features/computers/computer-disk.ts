import { type ComputerDiskStatus, computerDiskSeverity } from '@haus/api';

export function computerDiskWarning(computer: {
    health: string;
    diskStatus: ComputerDiskStatus | null;
}) {
    if (computer.health === 'offline' || computer.health === 'update-required') {
        return null;
    }
    const severity = computerDiskSeverity(computer.diskStatus);
    if (!(severity && computer.diskStatus)) {
        return null;
    }
    const disk = computer.diskStatus;
    const free = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        disk.availableBytes / 1024 ** 3
    );
    const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        (disk.availableBytes / disk.totalBytes) * 100
    );
    return { severity, label: `${free} GiB free (${percent}%)` };
}

export const computerDiskWarningDescription =
    'Agents may fail to save work or start when this disk fills up. Free up space on this Computer.';

const severityRank = { under10: 1, under5: 2, under2: 3, under1: 4 };

export function shouldShowDiskNotice(
    severity: keyof typeof severityRank,
    dismissed: string | null
) {
    const ranks = new Map<string, number>(Object.entries(severityRank));
    return severityRank[severity] > (ranks.get(dismissed ?? '') ?? 0);
}
