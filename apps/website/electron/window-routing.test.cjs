'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    buildWindowUrl,
    isOpenedFromWindow,
    isSafeWindowRoute,
    nextWindowBounds,
    openerArguments,
} = require('./window-routing.cjs');

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

test('buildWindowUrl seeds the hash route the desktop App router reads', () => {
    assert.equal(
        buildWindowUrl('https://haus.chat', '/s/acme/chats/abc'),
        'https://haus.chat/#/s/acme/chats/abc'
    );
    assert.equal(
        buildWindowUrl('http://localhost:3100', '/chats/abc'),
        'http://localhost:3100/#/chats/abc'
    );
    assert.equal(
        buildWindowUrl('http://localhost:3100/', '/s/acme/chats/c1?thread=m1'),
        'http://localhost:3100/#/s/acme/chats/c1?thread=m1'
    );
    assert.equal(buildWindowUrl('https://haus.chat', undefined), 'https://haus.chat');
});

test('buildWindowUrl keeps the route inside the fragment of the App origin', () => {
    const url = new URL(buildWindowUrl('https://haus.chat', '/s/acme/agents/a1#top'));
    assert.equal(url.origin, 'https://haus.chat');
    assert.equal(url.pathname, '/');
    assert.equal(url.hash, '#/s/acme/agents/a1#top');
});

test('only windows with an opener tell their renderer they were opened from a window', () => {
    assert.deepEqual(openerArguments(), []);
    assert.deepEqual(openerArguments({ opener: null }), []);
    const spawned = openerArguments({ opener: {} });
    assert.equal(isOpenedFromWindow(['electron', '--type=renderer', ...spawned]), true);
    assert.equal(isOpenedFromWindow(['electron', '--type=renderer']), false);
    assert.equal(isOpenedFromWindow(undefined), false);
});
