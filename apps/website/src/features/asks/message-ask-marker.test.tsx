import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageAskMarker } from './message-ask-marker.tsx';

const addresseeProfile = { avatarUrl: null, name: 'Zach' };

test('an open Ask marker names its addressee and keeps its status for readers', () => {
    const html = renderToStaticMarkup(
        <MessageAskMarker addresseeProfile={addresseeProfile} status="open" />
    );

    expect(html).toContain('Ask');
    expect(html).toContain('Zach');
    expect(html).toContain('Awaiting answer');
});

test('an answered Ask renders no marker', () => {
    const html = renderToStaticMarkup(
        <MessageAskMarker addresseeProfile={addresseeProfile} status="answered" />
    );

    expect(html).toBe('');
});
