import type { ProcessExitAttention } from '@haus/api';

export function composeProcessExitInput(attention: ProcessExitAttention) {
    const status =
        attention.exitCode === null
            ? 'ended when its Computer restarted'
            : `exited with code ${attention.exitCode}`;
    return [
        `[process exit · ${attention.processId} on ${attention.computerName} · ${status}]`,
        attention.tail ? `Last output:\n${attention.tail}` : 'It printed nothing.',
        `Its output ends at afterSeq ${attention.cursor}; process_read from afterSeq 0 reads all of it.`,
    ].join('\n');
}
