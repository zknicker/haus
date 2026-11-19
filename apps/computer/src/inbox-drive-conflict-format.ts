import type { DriveConflictAttention, DriveConflictFile } from '@haus/api';

const mergeGuidance =
    'Each original holds the current version and each copy holds yours. Merge what you still want into the original with ordinary file commands in drive/, then delete the copy.';
const refusedGuidance =
    'A refused file is not in Drive: your version is in drive-refused/ in your working directory, and drive/ holds what Drive has.';
const keptEditGuidance =
    'An edit always beats a delete. Delete the file again if you still mean to.';

const refusalReasons: Record<string, string> = {
    FORBIDDEN: 'you cannot write there',
    INVALID_PATH: 'not a Drive path',
    PATH_CONFLICT: 'a file and a folder share that path',
    SIZE_LIMIT: 'too large',
    STORAGE_LIMIT: 'Drive storage is full',
};

export function composeDriveConflictInput(
    attention: DriveConflictAttention,
    ownHandle: string | null
) {
    const count = attention.files.length;
    const outcomes = new Set(attention.files.map((file) => file.outcome));
    return [
        `[drive conflict · ${count} ${count === 1 ? 'file' : 'files'} · ${pushLabel(attention)}]`,
        ...attention.files.map((file) => formatFile(file, ownHandle)),
        outcomes.has('kept_both') ? mergeGuidance : null,
        outcomes.has('kept_edit') ? keptEditGuidance : null,
        outcomes.has('refused') ? refusedGuidance : null,
    ]
        .filter((line) => line !== null)
        .join('\n');
}

function pushLabel(attention: DriveConflictAttention) {
    const { writer } = attention;
    return writer.type === 'worker'
        ? `your Worker ${writer.workerId}'s push in task ${writer.taskId}, after ${attention.pushId}`
        : `your push after ${attention.pushId}`;
}

function formatFile(file: DriveConflictFile, ownHandle: string | null) {
    const who = file.currentAuthorHandle ? `@${file.currentAuthorHandle}` : 'someone';
    const yours = file.copyPath ? ` · yours: ${file.copyPath}` : '';
    if (file.outcome === 'refused') {
        const why = refusalReasons[file.reason] ?? file.reason;
        return `${file.path} · refused, ${why} · yours: drive-refused/${file.path}`;
    }
    if (file.outcome === 'kept_edit') {
        return ownHandle !== null && file.currentAuthorHandle === ownHandle
            ? `${file.path} · it was deleted, and your edit brought it back`
            : `${file.path} · ${who} edited it, so your delete did not happen`;
    }
    switch (file.reason) {
        case 'binary':
            return `${file.path} · binary, changed by ${who}${yours}`;
        case 'base_gone':
            return `${file.path} · the version you started from is gone; ${who} holds the current one${yours}`;
        case 'both_created':
            return `${file.path} · ${who} created it too${yours}`;
        default:
            return `${file.path} · ${who} changed the same lines${yours}`;
    }
}
