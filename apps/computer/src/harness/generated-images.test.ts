import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerNativeToolActivityFixtures } from './activity-tool-fixtures.ts';
import {
    createGeneratedImageSteps,
    generatedImagesDirectoryName,
    nativeImageToolFixtures,
} from './generated-images.ts';
import { describeToolAction } from './thought-action.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const now = () => new Date('2026-10-06T13:05:01.250Z');

async function setup(runtimeId: 'codex' | 'grok-build') {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-generated-images-')));
    roots.push(root);
    const workspaceDir = join(root, 'workspace');
    await mkdir(workspaceDir);
    const warnings: string[] = [];
    const steps = createGeneratedImageSteps({
        now,
        runtimeId,
        warn: (message) => warnings.push(message),
        workspaceDir,
    });
    return { root, steps, warnings, workspaceDir };
}

async function savedImage(path: string, bytes = 'png-bytes') {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes);
    return path;
}

describe('generated image workspace copy', () => {
    test('copies a Codex image into the workspace and drops the inline base64', async () => {
        const { root, steps, warnings, workspaceDir } = await setup('codex');
        const savedPath = await savedImage(
            join(root, 'home/.codex/generated_images/thread-1/exec-4df6.png')
        );
        // codex-acp 1.12.0 rawOutput for a finished `imageGeneration` item.
        const output = await steps.settle(
            'image_gen',
            {
                result: 'iVBORw0KGgo',
                revisedPrompt: 'A red circle on white.',
                savedPath,
                status: 'completed',
            },
            false
        );

        const path = `${generatedImagesDirectoryName}/20261006-130501-exec-4df6.png`;
        expect(output).toEqual({ path, revisedPrompt: 'A red circle on white.', savedPath });
        expect(await readFile(join(workspaceDir, path), 'utf8')).toBe('png-bytes');
        expect(warnings).toEqual([]);
    });

    test('copies Grok Build generations and edits without overwriting a same-named copy', async () => {
        const { root, steps, workspaceDir } = await setup('grok-build');
        const sessionImages = join(root, 'home/.grok/sessions/cwd/session-1/images');
        const first = await savedImage(join(sessionImages, '1.jpg'), 'first');
        const other = await savedImage(
            join(root, 'home/.grok/sessions/cwd/session-2/images/1.jpg'),
            'second'
        );

        // Grok Build 0.1 rawOutput for `image_gen` and `image_edit`.
        const generated = await steps.settle(
            'image_gen',
            { filename: '1.jpg', path: first, session_folder: 'images', type: 'ImageGen' },
            false
        );
        const edited = await steps.settle(
            'image_edit',
            { filename: '1.jpg', path: other, session_folder: 'images', type: 'ImageEdit' },
            false
        );

        expect(generated).toEqual({
            path: 'generated-images/20261006-130501-1.jpg',
            savedPath: first,
        });
        expect(edited).toEqual({
            path: 'generated-images/20261006-130501-2-1.jpg',
            savedPath: other,
        });
        expect(
            await readFile(join(workspaceDir, 'generated-images/20261006-130501-2-1.jpg'), 'utf8')
        ).toBe('second');
    });

    test('a missing file is logged and keeps the runtime path', async () => {
        const { root, steps, warnings } = await setup('codex');
        const savedPath = join(root, 'home/.codex/generated_images/thread-1/gone.png');

        expect(await steps.settle('image_gen', { savedPath }, false)).toEqual({
            path: savedPath,
            savedPath,
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(savedPath);
    });

    test('a file already in the workspace is referenced, not copied', async () => {
        const { steps, workspaceDir } = await setup('grok-build');
        const savedPath = await savedImage(join(workspaceDir, 'art/logo.png'));

        expect(await steps.settle('image_gen', { path: savedPath }, false)).toEqual({
            path: 'art/logo.png',
            savedPath,
        });
    });

    test('only finished image results from the runtime that owns the tool are touched', async () => {
        const { root, steps, warnings } = await setup('grok-build');
        const notImage = await savedImage(join(root, 'home/.ssh/id_rsa'));
        const video = { path: join(root, 'clip.mp4'), type: 'ImageToVideo' };

        expect(await steps.settle('image_gen', { path: notImage }, false)).toEqual({
            path: notImage,
            savedPath: notImage,
        });
        expect(warnings[0]).toContain('not an image file path');
        expect(await steps.settle('image_to_video', video, false)).toBe(video);
        expect(await steps.settle('image_gen', { path: notImage }, true)).toEqual({
            path: notImage,
        });
        expect(await steps.settle('bash', { stdout: 'ok' }, false)).toEqual({ stdout: 'ok' });
        const codex = await setup('codex');
        expect(await codex.steps.settle('image_edit', { path: 'x.png' }, false)).toEqual({
            path: 'x.png',
        });
    });
});

describe('native image tools', () => {
    test('every native image tool is an Activity tool for its runtime', () => {
        for (const [runtimeId, tools] of Object.entries(nativeImageToolFixtures)) {
            const activity: Readonly<Record<string, string>> =
                computerNativeToolActivityFixtures[
                    runtimeId as keyof typeof computerNativeToolActivityFixtures
                ];
            for (const toolName of Object.keys(tools)) {
                expect([runtimeId, toolName, activity[toolName]]).toEqual([
                    runtimeId,
                    toolName,
                    'using_tool',
                ]);
            }
        }
    });

    test('thoughts name the image request with its scrubbed prompt', () => {
        const describe = (runtimeId: string, toolName: string, input: unknown) =>
            describeToolAction({
                classification: { category: 'using_tool', outcome: 'activity' },
                input,
                runtimeId,
                toolName,
            });

        expect(
            describe('grok-build', 'image_gen', {
                aspect_ratio: '1:1',
                prompt: 'A red "circle" on white, see https://example.com/ref?token=abc',
            })
        ).toBe('generate an image: A red circle on white, see example.com/ref');
        expect(
            describe('grok-build', 'image_edit', { image: ['/a/1.jpg'], prompt: 'Make it blue' })
        ).toBe('edit an image: Make it blue');
        expect(describe('grok-build', 'reference_to_video', { prompt: 'Spin it' })).toBe(
            'make a video: Spin it'
        );
        // Codex's call carries only its id; the prompt arrives with the result.
        expect(describe('codex', 'image_gen', { id: 'exec-1' })).toBe('generate an image');
    });
});
