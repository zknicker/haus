'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildWindowUrl, isSafeWindowRoute, nextWindowBounds } = require('./window-routing.cjs');

test('isSafeWindowRoute only accepts in-app routes', () => {
    assert.equal(isSafeWindowRoute('/chats/abc'), true);
    assert.equal(isSafeWindowRoute('/members/agents/abc'), true);
    assert.equal(isSafeWindowRoute('/settings'), true);
    assert.equal(isSafeWindowRoute('/settings?tab=general'), true);
    assert.equal(isSafeWindowRoute('/chatsroom'), false);
    assert.equal(isSafeWindowRoute('/new/key'), false);
    assert.equal(isSafeWindowRoute('/dashboard/chats/abc'), false);
    assert.equal(isSafeWindowRoute('https://evil.example'), false);
    assert.equal(isSafeWindowRoute(undefined), false);
    assert.equal(isSafeWindowRoute(42), false);
});

test('isSafeWindowRoute accepts Server routes and rejects other origins', () => {
    assert.equal(isSafeWindowRoute('/s/acme'), true);
    assert.equal(isSafeWindowRoute('/s/acme/chats/c1?thread=m1'), true);
    assert.equal(isSafeWindowRoute('/s/acme-2/agents/a1#top'), true);
    assert.equal(isSafeWindowRoute('/s/'), false);
    assert.equal(isSafeWindowRoute('/s'), false);
    assert.equal(isSafeWindowRoute('//evil.example/s/acme'), false);
    assert.equal(isSafeWindowRoute('/s/acme\\..\\evil'), false);
    assert.equal(isSafeWindowRoute('/\\evil.example'), false);
    assert.equal(isSafeWindowRoute('/s/acme/\nchats'), false);
    assert.equal(isSafeWindowRoute('https://evil.example/s/acme'), false);
});

test('nextWindowBounds centers the first window and offsets the rest', () => {
    assert.deepEqual(nextWindowBounds(undefined), {
        width: 1440,
        height: 960,
        x: undefined,
        y: undefined,
    });

    assert.deepEqual(
        nextWindowBounds({ x: 100, y: 80, width: 1200, height: 800 }, { offset: 36 }),
        {
            width: 1200,
            height: 800,
            x: 136,
            y: 116,
        }
    );
});

test('buildWindowUrl seeds hosted and dev Haus App routes', () => {
    assert.equal(buildWindowUrl('https://haus.chat', '/chats/abc'), 'https://haus.chat/chats/abc');
    assert.equal(
        buildWindowUrl('http://localhost:3100', '/chats/abc'),
        'http://localhost:3100/chats/abc'
    );
    assert.equal(buildWindowUrl('https://haus.chat', undefined), 'https://haus.chat');
});
