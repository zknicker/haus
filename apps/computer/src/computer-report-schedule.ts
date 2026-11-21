import type { AttachmentConnectionWork } from './attachment-connection-work.ts';
import { sendComputerDiskReport } from './computer-disk.ts';
import { reportStateError } from './computer-report.ts';

/** Installed once per attachment daemon; reconnects send a fresh initial sample. */
export function startComputerReportSchedule(
    work: AttachmentConnectionWork,
    dataRoot: string,
    send: (frame: unknown) => boolean,
    reportUsage: () => Promise<void>,
    reportComputerUse: () => Promise<void>
) {
    work.startLoop('1 hour', () => sendComputerDiskReport(dataRoot, send), reportStateError);
    work.startLoop('1 minute', reportComputerUse, reportStateError);
    if (process.env.HAUS_COMPUTER_USAGE_DISABLED !== '1') {
        work.startLoop('15 minutes', reportUsage, reportStateError);
    }
}
