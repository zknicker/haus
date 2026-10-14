import { expect, test } from 'bun:test';
import { AgentCliError } from '../agent-error.ts';
import { readGenerateFlags, runImageGenerate } from '../image-generate.ts';
import { imageNotPostedSentence } from '../image-render.ts';
import { runImageWait } from '../image-wait.ts';
import {
    args,
    harness,
    ID,
    link,
    ready,
    sizeOmits,
    waitArgs,
} from './agent-image-test-fixtures.ts';

test('generate creates the record, prints the Link and hint, and returns without polling', async () => {
    const h = harness({ polls: [] });
    expect(await runImageGenerate(args(), h.deps)).toBe(0);
    expect(h.out.join('')).toBe(
        [
            `Image generation started with Nano Banana 2.1. Generation ID: ${ID}`,
            `Link: ${link}`,
            `Nothing was posted. Include this Link line in a haus message send now; the card shows progress and updates when the image is ready. Only run haus image wait ${ID} if your next step needs the file; you'll get an Inbox notice if the generation fails.`,
            '',
        ].join('\n')
    );
    expect(imageNotPostedSentence(ID)).toContain('Nothing was posted.');
    expect(h.sleeps).toEqual([]);
    expect(h.mkdirs).toEqual([]);
    expect(h.writes).toEqual([]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.body).toMatchObject({
        aspect: '16:9',
        model: 'gemini-nano-banana-2.1',
        nonce: 'nonce-1',
        prompt: 'A lighthouse at dawn.',
        referenceAttachmentIds: [],
        resolution: '2K',
    });
});

test('generate takes exact --size and --quality', async () => {
    const h2 = harness({ polls: [] });
    const sizeArgs = args({ '--quality': 'high', '--size': '1536x1024' }, {}, sizeOmits);
    await runImageGenerate(sizeArgs, h2.deps);
    expect(h2.requests[0]?.body).toMatchObject({
        quality: 'high',
        size: { height: 1024, width: 1536 },
    });
});

test('wait polls until ready, then saves the file and prints the receipt', async () => {
    const h = harness({ polls: [{ state: 'generating' }, ready] });
    expect(await runImageWait(waitArgs(), h.deps)).toBe(0);
    expect(h.out.join('')).toBe(
        [
            'State: ready',
            `Path: generated-images/20261013-123456-${ID}.png`,
            'Attachment ID: att_ready1',
            'Model: Nano Banana 2.1 (gemini-nano-banana-2.1)',
            'Size: 2048x1152 (2K)',
            'Quality: default',
            'Duration: 12.3s',
            'Cost: $0.05 (estimate)',
            'The linked card already shows this image. Do not attach or re-send it unless someone asks for the file.',
            '',
        ].join('\n')
    );
    expect(h.mkdirs).toEqual(['generated-images']);
    expect(h.writes[0]?.path).toBe(`generated-images/20261013-123456-${ID}.png`);
    expect(h.writes[0]?.data.toString()).toBe('png');
    expect(h.sleeps).toEqual([1000]);
    expect(h.requests.at(-1)?.path).toBe('/api/agent/attachments/att_ready1');
});

test('wait on an already-ready generation does not sleep and honors --out', async () => {
    const h = harness({ polls: [ready] });
    await runImageWait(waitArgs({ '--out': 'art/drafts' }), h.deps);
    expect(h.sleeps).toEqual([]);
    expect(h.mkdirs).toEqual(['art/drafts']);
    expect(h.writes[0]?.path).toBe(`art/drafts/20261013-123456-${ID}.png`);
    await runImageWait(waitArgs({ '--out': 'art/drafts' }), harness({ polls: [ready] }).deps);
});

test.each([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'auto',
])('quality %s is passed through unvalidated', (quality) => {
    expect(readGenerateFlags(args({ '--quality': quality })).input.quality).toBe(quality);
});

test('a failed generation fails wait with the reason', async () => {
    const h = harness({
        polls: [
            {
                cost: null,
                durationMs: 900,
                errorCode: 'provider-rejected',
                reason: 'The prompt was refused.',
                state: 'failed',
            },
        ],
    });
    const error = await runImageWait(waitArgs(), h.deps).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AgentCliError);
    expect((error as AgentCliError).code).toBe('provider-rejected');
    expect((error as AgentCliError).message).toBe(
        'Image generation failed: The prompt was refused.'
    );
    expect(h.writes).toEqual([]);
});

test('wait stops with a timeout error that says to run wait again', async () => {
    const h = harness({ polls: [], timeoutMs: 3000 });
    const error = await runImageWait(waitArgs(), h.deps).catch((caught: unknown) => caught);
    expect((error as AgentCliError).code).toBe('IMAGE_GENERATION_TIMEOUT');
    expect((error as AgentCliError).options.nextAction).toContain(`haus image wait ${ID}`);
    expect(h.sleeps).toEqual([1000, 1000, 1000]);
});

test('wait --timeout overrides the default and rejects nonsense', async () => {
    const h = harness({ polls: [], timeoutMs: 60_000 });
    const error = await runImageWait(waitArgs({ '--timeout': '2' }), h.deps).catch(
        (caught: unknown) => caught
    );
    expect((error as AgentCliError).code).toBe('IMAGE_GENERATION_TIMEOUT');
    expect(h.sleeps).toEqual([1000, 1000]);
    await expect(
        runImageWait(waitArgs({ '--timeout': 'soon' }), harness({ polls: [] }).deps)
    ).rejects.toMatchObject({ code: 'INVALID_ARG' });
});

test('flag shape errors never reach the Server', async () => {
    // --size conflicts with the default aspect/resolution; the rest are malformed on their own.
    const cases: Record<string, string>[] = [
        { '--size': '1024x1024' },
        { '--size': 'wide' },
        { '--background': 'clear' },
        { '--resolution': '8K' },
    ];
    for (const values of cases) {
        const h = harness({ polls: [ready] });
        const a = args(values, {}, values['--size'] === 'wide' ? sizeOmits : []);
        await expect(runImageGenerate(a, h.deps)).rejects.toMatchObject({ code: 'INVALID_ARG' });
        expect(h.requests).toEqual([]);
    }
    const missing = args({}, {}, ['--model']);
    await expect(runImageGenerate(missing, harness({ polls: [] }).deps)).rejects.toMatchObject({
        code: 'INVALID_ARG',
    });
});

test('a missing prompt on stdin is refused with a recipe', async () => {
    const h = harness({ polls: [ready] });
    h.deps.readStdin = () => Promise.resolve('  \n');
    const error = await runImageGenerate(args(), h.deps).catch((caught: unknown) => caught);
    expect((error as AgentCliError).code).toBe('MISSING_CONTENT');
    expect(h.requests).toEqual([]);
});
