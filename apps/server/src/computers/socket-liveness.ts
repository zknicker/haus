import { WebSocket } from 'ws';

export interface ComputerSocketLivenessTiming {
    intervalMs: number;
    /** How long an on-demand presence probe waits for any frame before reaping. */
    probeTimeoutMs: number;
    timeoutMs: number;
}

/** Routine liveness matches Raft: ping every 30s, reap after 60s of silence. */
export const defaultComputerSocketLiveness: ComputerSocketLivenessTiming = {
    intervalMs: 30_000,
    probeTimeoutMs: 3000,
    timeoutMs: 60_000,
};

export interface ComputerSocketLiveness {
    /**
     * Pings now and resolves `true` on the next pong or inbound frame. Silence
     * past `timeoutMs` reaps the socket through the same path as the routine
     * timeout and resolves `false`. Concurrent probes share one ping.
     */
    probe(timeoutMs: number): Promise<boolean>;
    stop(): void;
}

/**
 * Transport-level liveness for one attachment socket, independent of the
 * Computer's protocol version. Every WebSocket client answers a ping frame, so
 * a Computer that vanished silently (sleep, network loss) is reaped even when
 * it never negotiated the app-level heartbeat.
 */
export function watchComputerSocketLiveness(
    socket: WebSocket,
    timing: ComputerSocketLivenessTiming,
    onTimeout: () => void
): ComputerSocketLiveness {
    let lastSeenAt = Date.now();
    let pendingProbe: Promise<boolean> | null = null;
    let answerProbe: ((alive: boolean) => void) | null = null;
    const seen = () => {
        lastSeenAt = Date.now();
        answerProbe?.(true);
    };
    socket.on('pong', seen);
    socket.on('message', seen);
    const interval = setInterval(() => {
        if (Date.now() - lastSeenAt >= timing.timeoutMs) {
            clearInterval(interval);
            onTimeout();
            return;
        }
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
    }, timing.intervalMs);
    interval.unref();

    const probe = (timeoutMs: number) => {
        if (socket.readyState !== WebSocket.OPEN) {
            return Promise.resolve(false);
        }
        if (pendingProbe) {
            return pendingProbe;
        }
        pendingProbe = new Promise<boolean>((resolve) => {
            const deadline = setTimeout(() => {
                settle(false);
                onTimeout();
            }, timeoutMs);
            const settle = (alive: boolean) => {
                clearTimeout(deadline);
                answerProbe = null;
                pendingProbe = null;
                resolve(alive);
            };
            answerProbe = settle;
            socket.ping();
        });
        return pendingProbe;
    };

    return {
        probe,
        stop: () => {
            clearInterval(interval);
            answerProbe?.(false);
        },
    };
}
