import { afterAll, expect, test } from 'bun:test';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
function activityRun(events: Array<{ category: string; phase: string }>) {
    return new AgentActivityRun(runtime, ({ category, phase }) => events.push({ category, phase }));
}

test('a native image tool stays live using_tool activity but counts as a generated image', async () => {
    const events: Array<{ category: string; phase: string }> = [];
    const activity = activityRun(events);
    const projector = createComputerActivityProjector({
        activity,
        registry: createComputerActivityRegistry(),
        runtimeId: 'codex',
    });

    await projector.observe({
        providerExecuted: true,
        toolCallId: 'call_image',
        toolName: 'image_gen',
        type: 'tool-call',
    });
    await projector.observe({
        output: { revisedPrompt: 'a lighthouse' },
        providerExecuted: true,
        toolCallId: 'call_image',
        toolName: 'image_gen',
        type: 'tool-result',
    });

    expect(events).toEqual([
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
    ]);
    expect(activity.snapshot()).toEqual({
        operations: [{ category: 'generating_image', completed: 1, failed: 0, interrupted: 0 }],
    });
});

test('a native video tool counts as a generated video, not an image', async () => {
    const activity = activityRun([]);
    const projector = createComputerActivityProjector({
        activity,
        registry: createComputerActivityRegistry(),
        runtimeId: 'grok-build',
    });

    await projector.observe({
        providerExecuted: true,
        toolCallId: 'call_video',
        toolName: 'image_to_video',
        type: 'tool-call',
    });
    await projector.observe({
        output: {},
        providerExecuted: true,
        toolCallId: 'call_video',
        toolName: 'image_to_video',
        type: 'tool-result',
    });

    expect(activity.snapshot()).toEqual({
        operations: [{ category: 'generating_video', completed: 1, failed: 0, interrupted: 0 }],
    });
});
