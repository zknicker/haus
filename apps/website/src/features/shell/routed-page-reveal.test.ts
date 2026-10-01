import { describe, expect, test } from 'bun:test';
import { NavigationType } from 'react-router-dom';
import { revealsRoutedPage } from './routed-page-reveal.ts';

const chat = { hash: '', key: 'a', pathname: '/s/haus/chats/1', search: '' };

describe('revealsRoutedPage', () => {
    test('mount and a new page reveal the routed page', () => {
        expect(revealsRoutedPage(null, chat, NavigationType.Pop)).toBe(true);
        expect(
            revealsRoutedPage(
                chat,
                { ...chat, key: 'b', pathname: '/s/haus/chats/2' },
                NavigationType.Push
            )
        ).toBe(true);
    });

    test('a same-URL re-navigation reveals the page a tab covers', () => {
        expect(revealsRoutedPage(chat, { ...chat, key: 'b' }, NavigationType.Replace)).toBe(true);
        expect(revealsRoutedPage(chat, { ...chat, key: 'b' }, NavigationType.Push)).toBe(true);
    });

    test('a search-only replace keeps a tab opened in the same gesture selected', () => {
        const peeked = { ...chat, search: '?thread=t1' };
        expect(revealsRoutedPage(peeked, { ...chat, key: 'b' }, NavigationType.Replace)).toBe(
            false
        );
        expect(revealsRoutedPage(chat, chat, NavigationType.Replace)).toBe(false);
    });
});
