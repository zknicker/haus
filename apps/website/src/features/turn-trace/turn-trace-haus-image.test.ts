import { expect, test } from 'bun:test';
import { hausImageLabels, readHausImageCall } from './turn-trace-haus-image.ts';

const generate =
    "haus image generate --model gpt-image-2.5-sunburst --size 2048x1152 <<'PROMPT'\nA warm hero.\nPROMPT";

test('a generate call reads its model display name from the start line', () => {
    const call = readHausImageCall(
        generate,
        'Image generation started with GPT Image 2.5 Sunburst. Generation ID: img_1\nLink: haus://x\nNothing was posted.'
    );
    expect(call).toMatchObject({
        cost: null,
        modelId: 'gpt-image-2.5-sunburst',
        modelName: 'GPT Image 2.5 Sunburst',
        phase: 'start',
        workspacePath: null,
    });
    expect(hausImageLabels(call as NonNullable<typeof call>)).toEqual({
        past: 'Started · GPT Image 2.5 Sunburst',
        present: 'Starting · GPT Image 2.5 Sunburst',
    });
});

test('a start call still running falls back to the model id', () => {
    const call = readHausImageCall(
        'haus image generate --model gemini-nano-banana-2.1 --reference att_1',
        undefined
    );
    expect(call).toMatchObject({ modelName: null, phase: 'start' });
    expect(hausImageLabels(call as NonNullable<typeof call>).past).toBe(
        'Started · gemini-nano-banana-2.1'
    );
});

test('a wait call reads model, path, and cost from the ready receipt', () => {
    const call = readHausImageCall(
        'haus image wait img_1',
        'State: ready\nPath: generated-images/a.png\nAttachment ID: att_1\nModel: GPT Image 2.5 Sunburst (gpt-image-2.5-sunburst)\nCost: $0.11 (estimate)'
    );
    expect(call).toMatchObject({
        cost: '$0.11 (estimate)',
        failed: false,
        modelName: 'GPT Image 2.5 Sunburst',
        phase: 'wait',
        workspacePath: 'generated-images/a.png',
    });
    expect(hausImageLabels(call as NonNullable<typeof call>)).toEqual({
        past: 'Generated · GPT Image 2.5 Sunburst',
        present: 'Generating · GPT Image 2.5 Sunburst',
    });
});

test('a wait call that failed or has no output yet stays tolerant', () => {
    const failed = readHausImageCall(
        'cd work && haus image wait img_1 --timeout 60',
        'Image generation failed: The prompt was refused.'
    );
    expect(failed).toMatchObject({ failed: true, modelName: null, workspacePath: null });
    expect(hausImageLabels(failed as NonNullable<typeof failed>).past).toBe('Generation failed');
    const running = readHausImageCall('haus image wait img_1', undefined);
    expect(hausImageLabels(running as NonNullable<typeof running>).present).toBe('Generating');
});

test('other haus commands are not image steps', () => {
    expect(readHausImageCall('haus image models', undefined)).toBeNull();
    expect(readHausImageCall('haus message send --target dm:@zach', undefined)).toBeNull();
});
