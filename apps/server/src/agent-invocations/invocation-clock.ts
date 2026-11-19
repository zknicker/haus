export interface InvocationClock {
    schedule(callback: () => void, delayMs: number): { cancel(): void };
}

export const systemInvocationClock: InvocationClock = {
    schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        return { cancel: () => clearTimeout(timer) };
    },
};
