import { expect, test } from 'bun:test';
import { Effect } from 'effect';
import { makeServerRuntime } from './server-runtime.ts';

test('Server runtime executes sync effects and can be disposed twice', async () => {
    const runtime = makeServerRuntime();
    expect(runtime.runSync(Effect.succeed('ready'))).toBe('ready');
    await runtime.dispose();
    await expect(runtime.dispose()).resolves.toBeUndefined();
});
