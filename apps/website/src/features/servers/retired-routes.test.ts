import { expect, test } from 'bun:test';
import { redirectRetiredRoute } from './retired-routes.ts';

const at = (path: string) => {
    const [pathname = '', search = ''] = path.split('?');
    return { pathname, search: search ? `?${search}` : '' };
};

test('a Thread page resolves to its parent Chat at the anchor Message', () => {
    expect(redirectRetiredRoute(at('/s/acme/threads/cht_1/msg_anchor'))).toBe(
        '/s/acme/chats/cht_1?message=msg_anchor'
    );
});

test('a Thread page opened on a claim inside it reveals the claimed Message', () => {
    expect(redirectRetiredRoute(at('/s/acme/threads/cht_1/msg_anchor?claim=msg_reply&at=4'))).toBe(
        '/s/acme/chats/cht_1?message=msg_reply'
    );
});

test('a Chat link that opened a Thread, or a claim, reveals that Message instead', () => {
    expect(redirectRetiredRoute(at('/s/acme/chats/cht_1?thread=msg_anchor&at=12'))).toBe(
        '/s/acme/chats/cht_1?message=msg_anchor'
    );
    expect(redirectRetiredRoute(at('/s/acme/chats/cht_1?claim=msg_claim'))).toBe(
        '/s/acme/chats/cht_1?message=msg_claim'
    );
});

test('encoded segments round-trip once, never double-encoded', () => {
    expect(redirectRetiredRoute(at('/s/acme/threads/cht%201/msg%2Fa'))).toBe(
        '/s/acme/chats/cht%201?message=msg%2Fa'
    );
});

test('every other address needs no redirect', () => {
    expect(redirectRetiredRoute(at('/s/acme/chats/cht_1'))).toBeNull();
    expect(redirectRetiredRoute(at('/s/acme/chats/cht_1?message=msg_1'))).toBeNull();
    expect(redirectRetiredRoute(at('/s/acme/tasks/SEC-1'))).toBeNull();
    expect(redirectRetiredRoute(at('/s/acme/threads/cht_1'))).toBeNull();
    expect(redirectRetiredRoute(at('/s/acme/threads/%E0%A4%A/msg_1'))).toBeNull();
});
