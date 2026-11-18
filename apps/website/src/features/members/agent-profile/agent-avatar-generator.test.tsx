import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarConceptBar } from './agent-avatar-generation-dialog.tsx';
import {
    type AvatarGenerationSession,
    initialAvatarGenerationSession,
    latestRunSlot,
} from './avatar-generation-session.ts';
import { AvatarGenerationStage } from './avatar-generation-stage.tsx';
import { AvatarStagePager, pagerKeyDelta } from './avatar-stage-pager.tsx';

const avatar = {
    bytesBase64: 'cHJldmlldw==',
    byteSize: 7,
    height: 256 as const,
    mediaType: 'image/png' as const,
    width: 256 as const,
};

const noop = () => undefined;

const oneVariant: AvatarGenerationSession = {
    ...initialAvatarGenerationSession,
    concept: 'a fox mechanic',
    staged: 'variant-1',
    variants: [{ avatar, id: 'variant-1' }],
};

function conceptBar(session: AvatarGenerationSession) {
    return renderToStaticMarkup(
        <AvatarConceptBar onConceptChange={noop} onGenerate={noop} session={session} />
    );
}

test('a blank concept disables submit without native required validation', () => {
    const markup = conceptBar({ ...initialAvatarGenerationSession, concept: '   ' });

    expect(markup).toContain('aria-label="Generate"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('required');
    expect(markup).toContain('maxLength="280"');
});

test('a save error never relabels the generate control', () => {
    const markup = conceptBar({ ...oneVariant, saveError: 'Avatar storage is unavailable.' });

    expect(markup).toContain('aria-label="Generate another"');
    expect(markup).not.toContain('Try Again');
    expect(markup).not.toContain('disabled=""');
});

test('the empty stage shows the current mark, not a drop zone', () => {
    const markup = renderToStaticMarkup(
        <AvatarGenerationStage
            currentAvatarUrl={null}
            name="Scout"
            onStage={noop}
            session={initialAvatarGenerationSession}
        />
    );

    expect(markup).toContain('SC');
    expect(markup).not.toContain('<img');
});

test('the stage shows the staged variant as crisp pixel art', () => {
    const markup = renderToStaticMarkup(
        <AvatarGenerationStage
            currentAvatarUrl={null}
            name="Scout"
            onStage={noop}
            session={oneVariant}
        />
    );

    expect(markup).toContain('alt="Scout avatar, variant 1"');
    expect(markup).toContain('data:image/png;base64,cHJldmlldw==');
    expect(markup).toContain('image-rendering:pixelated');
});

test('a failed run shows its error on the stage while variants stay in the tray', () => {
    const session: AvatarGenerationSession = {
        ...oneVariant,
        run: { error: 'The image provider is unavailable.', id: 2, status: 'failed' },
        staged: latestRunSlot,
    };
    const stage = renderToStaticMarkup(
        <AvatarGenerationStage
            currentAvatarUrl={null}
            name="Scout"
            onStage={noop}
            session={session}
        />
    );
    const pager = renderToStaticMarkup(<AvatarStagePager onStage={noop} session={session} />);

    expect(stage).toContain('The image provider is unavailable.');
    expect(pager).toContain('2 / 2');
    expect(pager).toContain('Variant 2 of 2 failed');
});

const threeVariants: AvatarGenerationSession = {
    ...oneVariant,
    staged: 'variant-2',
    variants: [
        { avatar, id: 'variant-1' },
        { avatar, id: 'variant-2' },
        { avatar, id: 'variant-3' },
    ],
};

test('a single page needs no pager', () => {
    expect(renderToStaticMarkup(<AvatarStagePager onStage={noop} session={oneVariant} />)).toBe('');
    const stage = renderToStaticMarkup(
        <AvatarGenerationStage
            currentAvatarUrl={null}
            name="Scout"
            onStage={noop}
            session={oneVariant}
        />
    );
    expect(stage).not.toContain('Next variant');
});

test('the pager labels its buttons and counts the shown page', () => {
    const markup = renderToStaticMarkup(
        <AvatarStagePager onStage={noop} session={threeVariants} />
    );

    expect(markup).toContain('aria-label="Previous variant"');
    expect(markup).toContain('aria-label="Next variant"');
    expect(markup).toContain('2 / 3');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Variant 2 of 3');
});

test('a run in flight is the last page', () => {
    const markup = renderToStaticMarkup(
        <AvatarStagePager
            onStage={noop}
            session={{ ...oneVariant, run: { id: 2, status: 'generating' }, staged: latestRunSlot }}
        />
    );

    expect(markup).toContain('2 / 2');
    expect(markup).toContain('Drawing variant 2 of 2');
});

test('only Left and Right page', () => {
    expect(pagerKeyDelta('ArrowLeft')).toBe(-1);
    expect(pagerKeyDelta('ArrowRight')).toBe(1);
    expect(pagerKeyDelta('ArrowUp')).toBe(0);
    expect(pagerKeyDelta('Enter')).toBe(0);
});

test('a long generation error is clamped inside the fixed stage', () => {
    const error = 'The image provider refused this concept. '.repeat(8);
    const markup = renderToStaticMarkup(
        <AvatarGenerationStage
            currentAvatarUrl={null}
            name="Scout"
            onStage={noop}
            session={{
                ...initialAvatarGenerationSession,
                run: { error, id: 1, status: 'failed' },
                staged: latestRunSlot,
            }}
        />
    );

    expect(markup).toContain('aspect-square w-full');
    expect(markup).toContain('line-clamp-4');
});
