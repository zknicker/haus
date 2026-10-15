import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
    handleStopSignals,
    type ServerStopInput,
    serverStopDeadlineMs,
    stopServer,
} from './haus-server-stop.ts';

function stopInput(close: () => Promise<void>, deadlineMs = 1000) {
    const exits: number[] = [];
    const failures: unknown[] = [];
    const lines: string[] = [];
    const input: ServerStopInput = {
        close,
        deadlineMs,
        exit: (code) => exits.push(code),
        log: (line) => lines.push(line.replace(/\d+ms/, 'Nms')),
        reportFailure: (error) => failures.push(error),
        signal: 'SIGTERM',
    };
    return { exits, failures, input, lines };
}

test('exits 0 once the Server closes', async () => {
    const stop = stopInput(async () => undefined);
    await stopServer(stop.input);
    expect(stop.exits).toEqual([0]);
    expect(stop.lines).toEqual([
        '[haus] shutdown started (SIGTERM)',
        '[haus] shutdown finished in Nms',
    ]);
});

test('reports a failed close and still exits', async () => {
    const failure = new Error('database close failed');
    const stop = stopInput(() => Promise.reject(failure));
    await stopServer(stop.input);
    expect(stop.failures).toEqual([failure]);
    expect(stop.exits).toEqual([1]);
});

test('exits at the deadline when close never settles', async () => {
    const stop = stopInput(() => new Promise<void>(() => undefined), 30);
    await stopServer(stop.input);
    expect(stop.exits).toEqual([1]);
    expect(stop.lines.at(-1)).toBe('[haus] shutdown still pending after Nms; exiting');
});

test('lands the default deadline before launchd hard kills at 20s', () => {
    expect(serverStopDeadlineMs).toBeLessThan(20_000);
});

test('a second signal of the other kind exits 1 without waiting for close', async () => {
    const signals = new EventEmitter();
    const release = Promise.withResolvers<void>();
    const closeStarted = Promise.withResolvers<void>();
    const stop = stopInput(() => {
        closeStarted.resolve();
        return release.promise;
    });
    handleStopSignals(signals, stop.input);

    signals.emit('SIGINT');
    await closeStarted.promise;
    expect(stop.lines).toEqual(['[haus] shutdown started (SIGINT)']);
    expect(stop.exits).toEqual([]);

    signals.emit('SIGTERM');
    expect(stop.lines.at(-1)).toBe('[haus] second signal; exiting now');
    expect(stop.exits).toEqual([1]);

    // The first stop still ends on its own once close settles.
    release.resolve();
    await Bun.sleep(0);
    expect(stop.exits).toEqual([1, 0]);
});

test('a repeated signal of the same kind also exits at once', () => {
    const signals = new EventEmitter();
    const stop = stopInput(() => new Promise<void>(() => undefined), 10);
    handleStopSignals(signals, stop.input);

    signals.emit('SIGTERM');
    signals.emit('SIGTERM');
    expect(stop.exits).toEqual([1]);
    expect(stop.lines).toEqual([
        '[haus] shutdown started (SIGTERM)',
        '[haus] second signal; exiting now',
    ]);
});
