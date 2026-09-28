import {
    admitChatTypingLaunch,
    type ChatTypingFace,
    type ChatTypingLaunchPath,
    planChatTypingLaunch,
} from './chat-typing-launch.ts';

/**
 * A face whose first animation frame comes this long after it entered the strip
 * was admitted while frames were stalled (a hidden, minimized, or occluded
 * window). It is dropped rather than played late alongside every other stalled face.
 */
export const chatTypingLaunchStaleMs = 500;

/** Whether a face reaching its first animation frame at `now` is too late to play. */
export function isStaleChatTypingLaunch(item: Pick<ChatTypingLaunch, 'admittedAt'>, now: number) {
    return now - item.admittedAt > chatTypingLaunchStaleMs;
}

export interface ChatTypingLaunch {
    /** When the face entered the strip, on the queue's clock. */
    admittedAt: number;
    face: ChatTypingFace;
    id: number;
    origin: { x: number; y: number };
    path: ChatTypingLaunchPath;
}

export interface ChatTypingLaunchQueueOptions {
    /** Whether the page is out of view; faces that arrive then are dropped. */
    isHidden: () => boolean;
    /** Where the dots are in the strip, or null once they are gone. */
    measure: () => { x: number; y: number } | null;
    now: () => number;
    schedule: (run: () => void, delayMs: number) => () => void;
}

export interface ChatTypingLaunchQueue {
    dispose: () => void;
    /** Drops every waiting and airborne face, as when the page is hidden. */
    drop: () => void;
    finish: (id: number) => void;
    getSnapshot: () => readonly ChatTypingLaunch[];
    launch: (face: ChatTypingFace) => void;
    subscribe: (listener: () => void) => () => void;
}

/**
 * Transient faces launched from the typing dots. They are presentation only:
 * never cached, dropped when throttled or out of view, and never replayed.
 */
export function createChatTypingLaunchQueue(
    options: ChatTypingLaunchQueueOptions
): ChatTypingLaunchQueue {
    const gate = {
        direction: 1 as 1 | -1,
        inFlight: 0,
        lastFace: null as ChatTypingFace | null,
        lastLaunchAt: null as number | null,
        lastOrigin: null as { x: number; y: number } | null,
        nextId: 0,
    };
    const pending = new Set<() => void>();
    const listeners = new Set<() => void>();
    let launches: readonly ChatTypingLaunch[] = [];

    const publish = (next: readonly ChatTypingLaunch[]) => {
        launches = next;
        for (const listener of listeners) {
            listener();
        }
    };
    const remove = (id: number) => {
        if (!launches.some((item) => item.id === id)) {
            return;
        }
        gate.inFlight = Math.max(0, gate.inFlight - 1);
        publish(launches.filter((item) => item.id !== id));
    };
    const start = (face: ChatTypingFace) => {
        // The dots are gone once typing ends; a reply's face still rises from
        // where they were.
        const origin = options.measure() ?? gate.lastOrigin;
        if (!origin || options.isHidden()) {
            gate.inFlight = Math.max(0, gate.inFlight - 1);
            return;
        }
        const path = planChatTypingLaunch(gate.direction);
        gate.direction = path.dx < 0 ? -1 : 1;
        gate.lastOrigin = origin;
        gate.nextId += 1;
        publish([...launches, { admittedAt: options.now(), face, id: gate.nextId, origin, path }]);
    };
    const clearPending = () => {
        for (const cancel of pending) {
            cancel();
        }
        pending.clear();
    };

    return {
        dispose: clearPending,
        drop: () => {
            clearPending();
            gate.inFlight = 0;
            if (launches.length > 0) {
                publish([]);
            }
        },
        finish: remove,
        getSnapshot: () => launches,
        launch: (face) => {
            if (options.isHidden()) {
                return;
            }
            const now = options.now();
            const delay = admitChatTypingLaunch(gate, now, face);
            if (delay === null) {
                return;
            }
            gate.inFlight += 1;
            gate.lastFace = face;
            gate.lastLaunchAt = now + delay;
            if (delay === 0) {
                start(face);
                return;
            }
            // A reply or failure face waits out the gap rather than stacking on another.
            const cancel = options.schedule(() => {
                pending.delete(cancel);
                start(face);
            }, delay);
            pending.add(cancel);
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
