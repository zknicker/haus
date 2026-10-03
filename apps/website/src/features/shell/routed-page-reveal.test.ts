import { describe, expect, test } from 'bun:test';
import { NavigationType } from 'react-router-dom';
import { agentAddressHandBack, revealsRoutedPage } from './routed-page-reveal.ts';

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

describe('agentAddressHandBack', () => {
    const options = { fallback: '/s/haus', page: '/s/haus/chats/1' };

    test('a push from an in-app page steps back, so history holds no duplicate entry', () => {
        expect(agentAddressHandBack(chat, NavigationType.Push, options)).toEqual({ kind: 'back' });
    });

    test('a deep link or a replace rewrites to the last page, or the fallback', () => {
        expect(agentAddressHandBack(null, NavigationType.Push, options)).toEqual({
            kind: 'replace',
            to: '/s/haus/chats/1',
        });
        expect(agentAddressHandBack(chat, NavigationType.Replace, options)).toEqual({
            kind: 'replace',
            to: '/s/haus/chats/1',
        });
        expect(agentAddressHandBack(null, NavigationType.Pop, { ...options, page: null })).toEqual({
            kind: 'replace',
            to: '/s/haus',
        });
    });
});
