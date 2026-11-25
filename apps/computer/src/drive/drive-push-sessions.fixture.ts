import type { DriveConflictFile } from '@haus/api';

export function drivePushSessions() {
    const pushes = new Map<
        string,
        { closed: boolean; listed: DriveConflictFile[]; writer: string }
    >();
    const undispatched = new Set<string>();
    return {
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
        undispatched: (pushId: string) => undispatched.add(pushId),
    };
}

export function notDispatched() {
    return Response.json({ code: 'NOT_FOUND', message: 'no run' }, { status: 404 });
}
