import { expect, spyOn, test } from 'bun:test';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import {
    closeRuntimeContext,
    openRuntimeContext,
    requireRuntimeContext,
} from './runtime/runtime-context.ts';
import { handleServerRuntimeSettingsFrame } from './server-runtime-settings-frame.ts';

test('the Server’s runtime settings turn idle compaction on and off for the warm pool', async () => {
    const runtime = makeDaemonRuntime();
    openRuntimeContext(runtime);
    try {
        const setting = spyOn(requireRuntimeContext(runtime).warm, 'setIdleCompaction');
        expect(
            handleServerRuntimeSettingsFrame(
                { idleCompaction: true, type: 'server-runtime-settings' },
                runtime
            )
        ).toBe(true);
        expect(
            handleServerRuntimeSettingsFrame(
                { idleCompaction: false, type: 'server-runtime-settings' },
                runtime
            )
        ).toBe(true);
        expect(setting.mock.calls).toEqual([[true], [false]]);
        // Anything else is some other frame's business.
        expect(handleServerRuntimeSettingsFrame({ type: 'agent-restart' }, runtime)).toBe(false);
        expect(handleServerRuntimeSettingsFrame({ type: 'server-runtime-settings' }, runtime)).toBe(
            false
        );
    } finally {
        await closeRuntimeContext(runtime);
    }
});
