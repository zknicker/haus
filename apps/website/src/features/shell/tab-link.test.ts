import { expect, test } from 'bun:test';
import { tabLink } from './tab-link.ts';

test('a web tab copies its page address', () => {
    const location = {
        kind: 'browser',
        title: 'x',
        url: 'https://x.test/a?b=1',
        viewId: 'v1',
    } as const;
    expect(tabLink(location, 'https://haus.chat')).toBe('https://x.test/a?b=1');
});

test('an App tab copies its absolute Haus link, query and hash included', () => {
    expect(tabLink({ kind: 'app', path: '/s/acme/chats/c1?message=m2' }, 'https://haus.chat')).toBe(
        'https://haus.chat/s/acme/chats/c1?message=m2'
    );
    expect(tabLink({ kind: 'app', path: '/s/acme/inbox' }, 'http://localhost:43444')).toBe(
        'http://localhost:43444/s/acme/inbox'
    );
});

test('the new tab page has no link', () => {
    expect(tabLink({ kind: 'newTab' }, 'https://haus.chat')).toBeNull();
});
