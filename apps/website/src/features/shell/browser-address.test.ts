import { expect, test } from 'bun:test';
import {
    classifyBrowserAddress,
    formatBrowserDisplayUrl,
    resolveBrowserAddress,
} from './browser-address.ts';

test('browser address entry keeps explicit schemes and distinguishes websites from search terms', () => {
    expect(resolveBrowserAddress('https://example.com/path')).toBe('https://example.com/path');
    expect(resolveBrowserAddress('example.com/path')).toBe('https://example.com/path');
    expect(resolveBrowserAddress('Haus browser tabs')).toBe(
        'https://www.google.com/search?q=Haus%20browser%20tabs'
    );
    expect(resolveBrowserAddress('javascript:alert(1)')).toBe('javascript:alert(1)');
});

test('hosts with a port are addresses, not schemes; local hosts use http', () => {
    expect(resolveBrowserAddress('localhost:3000/app')).toBe('http://localhost:3000/app');
    expect(resolveBrowserAddress('localhost')).toBe('http://localhost');
    expect(resolveBrowserAddress('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(resolveBrowserAddress('example.com:8443')).toBe('https://example.com:8443');
    expect(resolveBrowserAddress('mailto:a@b.test')).toBe('mailto:a@b.test');
});

test('address intent separates going somewhere from searching', () => {
    expect(classifyBrowserAddress('example.com').kind).toBe('go');
    expect(classifyBrowserAddress('what is haus').kind).toBe('search');
});

test('resting address drops scheme, www, trailing slash, query, and hash', () => {
    expect(formatBrowserDisplayUrl('https://example.com/')).toBe('example.com');
    expect(formatBrowserDisplayUrl('http://example.com')).toBe('example.com');
    expect(formatBrowserDisplayUrl('https://www.rfc-editor.org/info/rfc2606/')).toBe(
        'rfc-editor.org/info/rfc2606'
    );
    expect(formatBrowserDisplayUrl('https://www.google.com/search?q=haus#top')).toBe(
        'google.com/search'
    );
    expect(formatBrowserDisplayUrl('https://wwwexample.com/')).toBe('wwwexample.com');
});

test('resting address keeps ports, hides credentials, and decodes readable paths', () => {
    expect(formatBrowserDisplayUrl('http://localhost:3000/app/')).toBe('localhost:3000/app');
    expect(formatBrowserDisplayUrl('https://user:secret@example.com/a')).toBe('example.com/a');
    expect(formatBrowserDisplayUrl('https://example.com/caf%C3%A9')).toBe('example.com/café');
    expect(formatBrowserDisplayUrl('https://example.com/100%')).toBe('example.com/100%');
});

test('resting address keeps IDN hosts in punycode', () => {
    expect(formatBrowserDisplayUrl('https://bücher.de/')).toBe('xn--bcher-kva.de');
});

test('blank and non-web addresses', () => {
    expect(formatBrowserDisplayUrl('about:blank')).toBe('');
    expect(formatBrowserDisplayUrl('')).toBe('');
    expect(formatBrowserDisplayUrl('file:///Users/me/a.html')).toBe('file:///Users/me/a.html');
    expect(formatBrowserDisplayUrl('not a url')).toBe('not a url');
});
