import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileFact, ProfileFacts } from './profile-facts.tsx';

test('a fact pairs label then value in the DOM', () => {
    const markup = renderToStaticMarkup(
        <ProfileFacts>
            <ProfileFact label="Last connected" value="Sep 14, 2026, 9:41 AM" />
        </ProfileFacts>
    );

    expect(markup.indexOf('<dt')).toBeLessThan(markup.indexOf('<dd'));
});

test('the list is one description list, not a run of divs', () => {
    const markup = renderToStaticMarkup(
        <ProfileFacts>
            <ProfileFact label="Version" value="v3.1.2" />
            <ProfileFact label="Added" value="Sep 1, 2026" />
        </ProfileFacts>
    );

    expect(markup.match(/<dl/gu) ?? []).toHaveLength(1);
    expect(markup.match(/<dt/gu) ?? []).toHaveLength(2);
    expect(markup.match(/<dd/gu) ?? []).toHaveLength(2);
});

test('a value keeps its own numeral treatment without losing the shared type', () => {
    const markup = renderToStaticMarkup(
        <ProfileFacts>
            <ProfileFact className="tabular-nums" label="Joined" value="Sep 1, 2026" />
        </ProfileFacts>
    );

    expect(markup).toContain('tabular-nums');
    expect(markup).toContain('font-semibold');
});
