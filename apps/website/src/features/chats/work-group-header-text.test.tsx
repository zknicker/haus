import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkGroupHeaderText, WorkGroupHeaderTextView } from './work-group-header-text.tsx';

test('WorkGroupHeaderText primes active slot text without hiding the fallback label', () => {
    const markup = renderToStaticMarkup(
        <WorkGroupHeaderTextView
            canSlot={true}
            isActive={true}
            label="Running tests"
            slotReady={false}
        />
    );

    assert.match(markup, />Running tests</);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /aria-label="Running tests"/);
    assert.doesNotMatch(markup, /text-shimmer/);
});

test('WorkGroupHeaderText keeps slot text class through the ready handoff', () => {
    const markup = renderToStaticMarkup(
        <WorkGroupHeaderTextView
            canSlot={true}
            isActive={true}
            label="Searched code, ran a command"
            slotReady={true}
        />
    );

    assert.match(markup, /class="sr-only">Searched code, ran a command</);
    assert.match(markup, /class="slot-text inline-flex"/);
    assert.match(markup, /aria-label="Searched code, ran a command"/);
    assert.doesNotMatch(markup, /text-shimmer/);
});

test('WorkGroupHeaderText renders inactive labels without slot text', () => {
    const markup = renderToStaticMarkup(<WorkGroupHeaderText isActive={false} label="Ran tests" />);

    assert.match(markup, />Ran tests</);
    assert.doesNotMatch(markup, /aria-hidden="true"/);
});

test('WorkGroupHeaderText keeps long active labels on shimmer fallback', () => {
    const label =
        'Running a deliberately long command that stays out of slot text because it would be too wide';
    const markup = renderToStaticMarkup(<WorkGroupHeaderText isActive={true} label={label} />);

    assert.match(markup, /text-shimmer/);
    assert.match(markup, /Running a deliberately long command/);
    // Pro's shimmer owns an aria-hidden highlight layer, so assert the SlotText
    // branch is absent directly rather than through an aria-hidden proxy.
    assert.doesNotMatch(markup, /class="slot-text/);
});
