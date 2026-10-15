export const shutdownProcessOrder = [
    'desktop',
    'website',
    'computer',
    'haus',
    'storage',
    'postgres',
];

// PostgreSQL is signaled only when its turn comes, so Server and Computer teardown can still
// write (for example marking a closed Computer offline) before the database goes down.
const deferredStopSources = new Set(['postgres']);

// The forced stop path: every managed process at once, deferred ones included.
export function signalAllProcesses(processes, signal, signalProcess) {
    for (const [source, child] of processes) {
        signalProcess(child, managedStopSignal(source, signal));
    }
}

export async function stopInShutdownOrder({ processes, signal, signalProcess, stopProcess }) {
    for (const [source, child] of processes) {
        if (!deferredStopSources.has(source)) {
            signalProcess(child, managedStopSignal(source, signal));
        }
    }

    for (const source of shutdownProcessOrder) {
        const child = processes.get(source);
        if (child && deferredStopSources.has(source)) {
            signalProcess(child, managedStopSignal(source, signal));
        }
        await stopProcess(source);
    }
}

function managedStopSignal(source, signal) {
    return source === 'postgres' ? 'SIGINT' : signal;
}
