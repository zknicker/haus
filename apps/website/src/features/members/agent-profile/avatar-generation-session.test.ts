import { expect, test } from 'bun:test';
import {
    type AvatarGenerationAction,
    type AvatarGenerationSession,
    adjacentSlot,
    avatarGenerationSessionReducer,
    initialAvatarGenerationSession,
    latestRunSlot,
    sessionSlots,
    stagedVariant,
} from './avatar-generation-session.ts';
import { avatarGenerationErrorMessage } from './use-avatar-generation-session.ts';

const avatar = (bytesBase64: string) => ({
    bytesBase64,
    byteSize: 7,
    height: 256 as const,
    mediaType: 'image/png' as const,
    width: 256 as const,
});

function play(...actions: AvatarGenerationAction[]): AvatarGenerationSession {
    return actions.reduce(avatarGenerationSessionReducer, initialAvatarGenerationSession);
}

const firstVariant: AvatarGenerationAction[] = [
    { concept: 'a fox mechanic', type: 'conceptChanged' },
    { runId: 1, type: 'generationStarted' },
    { avatar: avatar('Zmlyc3Q='), runId: 1, type: 'generationSucceeded' },
];

test('regenerating keeps earlier variants selectable and stages the newest', () => {
    const session = play(
        ...firstVariant,
        { runId: 2, type: 'generationStarted' },
        { avatar: avatar('c2Vjb25k'), runId: 2, type: 'generationSucceeded' }
    );

    expect(session.variants.map((variant) => variant.avatar.bytesBase64)).toEqual([
        'Zmlyc3Q=',
        'c2Vjb25k',
    ]);
    expect(stagedVariant(session)?.avatar.bytesBase64).toBe('c2Vjb25k');

    const back = avatarGenerationSessionReducer(session, { slot: 'variant-1', type: 'staged' });
    expect(stagedVariant(back)?.avatar.bytesBase64).toBe('Zmlyc3Q=');
});

test('a result keeps a reader who staged an earlier variant where they are', () => {
    const session = play(
        ...firstVariant,
        { runId: 2, type: 'generationStarted' },
        { slot: 'variant-1', type: 'staged' },
        { avatar: avatar('c2Vjb25k'), runId: 2, type: 'generationSucceeded' }
    );

    expect(session.variants).toHaveLength(2);
    expect(session.staged).toBe('variant-1');
});

test('a failed regenerate keeps every variant and stages the failure', () => {
    const session = play(
        ...firstVariant,
        { runId: 2, type: 'generationStarted' },
        { error: 'The image provider is unavailable.', runId: 2, type: 'generationFailed' }
    );

    expect(session.variants).toHaveLength(1);
    expect(session.staged).toBe(latestRunSlot);
    expect(stagedVariant(session)).toBeNull();
    expect(session.run).toEqual({
        error: 'The image provider is unavailable.',
        id: 2,
        status: 'failed',
    });
    // The variant is still one tap away.
    const back = avatarGenerationSessionReducer(session, { slot: 'variant-1', type: 'staged' });
    expect(stagedVariant(back)?.id).toBe('variant-1');
});

test('a save error belongs to save and clears when it is retried or superseded', () => {
    const failed = play(
        ...firstVariant,
        { type: 'saveStarted' },
        {
            error: 'Avatar storage is unavailable.',
            type: 'saveFailed',
        }
    );

    expect(failed.saveError).toBe('Avatar storage is unavailable.');
    expect(failed.run).toBeNull();

    expect(avatarGenerationSessionReducer(failed, { type: 'saveStarted' }).saveError).toBeNull();
    expect(
        avatarGenerationSessionReducer(failed, { runId: 2, type: 'generationStarted' }).saveError
    ).toBeNull();
});

test('a generation error clears when the next run starts', () => {
    const session = play(
        { concept: 'a fox mechanic', type: 'conceptChanged' },
        { runId: 1, type: 'generationStarted' },
        { error: 'Busy.', runId: 1, type: 'generationFailed' },
        { runId: 2, type: 'generationStarted' }
    );

    expect(session.run).toEqual({ id: 2, status: 'generating' });
});

test('the session carries a run across close and reopen', () => {
    // Closing is not a session action; reopening only resets a saved session.
    const generating = play(...firstVariant, { runId: 2, type: 'generationStarted' });
    const reopened = avatarGenerationSessionReducer(generating, { type: 'opened' });
    expect(reopened).toBe(generating);

    const landed = avatarGenerationSessionReducer(reopened, {
        avatar: avatar('c2Vjb25k'),
        runId: 2,
        type: 'generationSucceeded',
    });
    expect(landed.variants).toHaveLength(2);
    expect(stagedVariant(landed)?.id).toBe('variant-2');
});

test('a result arriving after save does not resurrect the session', () => {
    const saved = play(
        ...firstVariant,
        { runId: 2, type: 'generationStarted' },
        { slot: 'variant-1', type: 'staged' },
        { type: 'saveStarted' },
        { type: 'saved' }
    );
    const late = avatarGenerationSessionReducer(saved, {
        avatar: avatar('c2Vjb25k'),
        runId: 2,
        type: 'generationSucceeded',
    });

    expect(late).toBe(saved);
    expect(avatarGenerationSessionReducer(late, { type: 'opened' })).toBe(
        initialAvatarGenerationSession
    );
});

test('a superseded run cannot overwrite the newer one', () => {
    const session = play(
        { runId: 1, type: 'generationStarted' },
        { runId: 2, type: 'generationStarted' },
        { error: 'Old failure.', runId: 1, type: 'generationFailed' }
    );

    expect(session.run).toEqual({ id: 2, status: 'generating' });
});

test('a busy Server reads as a friendly retry, other failures keep their message', () => {
    const busy = Object.assign(new Error('Avatar generation is busy.'), {
        data: { code: 'TOO_MANY_REQUESTS' },
    });

    expect(avatarGenerationErrorMessage(busy)).toBe(
        'Another avatar is still being drawn. Try again in a moment.'
    );
    expect(avatarGenerationErrorMessage(new Error('Provider failed.'))).toBe('Provider failed.');
    expect(avatarGenerationErrorMessage('nope')).toBe('The avatar could not be generated.');
});

test('paging walks variants then the latest run, wrapping, and save uses the shown page', () => {
    const session = play(
        ...firstVariant,
        { runId: 2, type: 'generationStarted' },
        { avatar: avatar('c2Vjb25k'), runId: 2, type: 'generationSucceeded' },
        { runId: 3, type: 'generationStarted' },
        { error: 'Busy.', runId: 3, type: 'generationFailed' }
    );
    expect(sessionSlots(session)).toEqual(['variant-1', 'variant-2', latestRunSlot]);
    expect(session.staged).toBe(latestRunSlot);

    expect(adjacentSlot(session, 1)).toBe('variant-1');
    const previous = avatarGenerationSessionReducer(session, {
        slot: adjacentSlot(session, -1) ?? '',
        type: 'staged',
    });
    expect(previous.staged).toBe('variant-2');
    expect(stagedVariant(previous)?.avatar.bytesBase64).toBe('c2Vjb25k');
});

test('one page has nowhere to go', () => {
    expect(adjacentSlot(play(...firstVariant), 1)).toBeNull();
});
