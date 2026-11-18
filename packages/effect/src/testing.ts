import { Layer, ManagedRuntime, TestContext } from 'effect';
import { type LifecycleConsole, makeLifecycleLoggerLayer } from './logging.ts';

/** Build the Bun-compatible lifecycle test runtime with virtual time enabled. */
export function makeTestRuntime(options: { output?: LifecycleConsole } = {}) {
    return ManagedRuntime.make(
        Layer.merge(TestContext.TestContext, makeLifecycleLoggerLayer(options.output))
    );
}
