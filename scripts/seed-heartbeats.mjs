// Applies the heartbeat and dream demo seed to the running development stack's existing
// database, without wiping it. Signs in through the eval harness like the agent tests do.
// Run it as `bun run seed:heartbeats` (set HAUS_DEV_STACK_ID to pick a named stack).
import { createEvalHarness } from './eval-harness.mjs';

const harness = await createEvalHarness({ evalName: 'seed-heartbeats' });
try {
    const result = await harness.trpc('dev.seedHeartbeats', { serverId: harness.serverId });
    process.stdout.write(
        `Seeded ${result.marks} heartbeat marks on ${harness.serverSlug} (${harness.serverUrl}).\n`
    );
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
} finally {
    await harness.cleanup();
    // Clerk's headless client keeps token-refresh timers alive after sign-out.
    process.exit(process.exitCode ?? 0);
}
