import type { DriveConflictFile } from '@haus/api';

export function drivePushSessions() {
    const pushes = new Map<
        string,
        { closed: boolean; listed: DriveConflictFile[]; writer: string }
    >();
    const undispatched = new Set<string>();
    const unsentNotes = new Map<string, string[]>();
    const sessions = {
        open(pushId: string, writer: string) {
            if (undispatched.has(pushId)) {
                return null;
            }
            const existing = pushes.get(pushId);
            if (existing) {
                return existing;
            }
            for (const earlier of pushes.values()) {
                if (earlier.writer === writer) {
                    earlier.closed = true;
                }
            }
            const push = { closed: false, listed: [] as DriveConflictFile[], writer };
            pushes.set(pushId, push);
            return push;
        },
        close(pushId: string, writer: string, unsent: readonly string[] = []) {
            const push = sessions.open(pushId, writer);
            if (push) {
                push.closed = true;
                if (unsent.length > 0 && !unsentNotes.has(pushId)) {
                    unsentNotes.set(pushId, [...unsent]);
                }
            }
            return push;
        },
        undispatched: (pushId: string) => undispatched.add(pushId),
        unsentNotes,
    };
    return sessions;
}

export function notDispatched() {
    return Response.json({ code: 'NOT_FOUND', message: 'no run' }, { status: 404 });
}
