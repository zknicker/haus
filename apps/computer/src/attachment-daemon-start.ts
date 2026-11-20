import { guardDevDaemonMemory } from './daemon-memory-guard.ts';
import { createRuntimePrewarmer } from './runtime/runtime-prewarm.ts';

export function prepareAttachmentDaemon(slug: string) {
    guardDevDaemonMemory(slug);
    return createRuntimePrewarmer({
        ...(process.env.HAUS_DEV_STACK === '1' ? { runtimes: ['codex'] } : {}),
    });
}
