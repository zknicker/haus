import { afterAll } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { ComputerConnections } from '../src/computers/connections.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';

export function registerServerRuntime() {
    const runtime = makeServerRuntime();
    afterAll(() => runtime.dispose());
    return runtime;
}

export function registerTestConnections(): () => ComputerConnections {
    const runtime = makeTestRuntime();
    afterAll(() => runtime.dispose());
    return () => new ComputerConnections(runtime);
}
