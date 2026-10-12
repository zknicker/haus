import { describe, expect, test } from 'bun:test';
import { collectSharedArtifactLinks, parseSharedArtifactLink } from './shared-artifact-link.ts';

const scope = { origins: ['https://app.haus.test'], slug: 'acme' };

describe('parseSharedArtifactLink', () => {
    test('reads a stable URL on this App for the open Server', () => {
        expect(
            parseSharedArtifactLink('https://app.haus.test/s/acme/artifacts/art_123', scope)
        ).toEqual({ artifactId: 'art_123' });
        expect(
            parseSharedArtifactLink(
                'https://app.haus.test/s/acme/artifacts/art_123?revision=rev_9',
                scope
            )
        ).toEqual({ artifactId: 'art_123', revisionId: 'rev_9' });
        expect(parseSharedArtifactLink('/s/acme/artifacts/art_123', scope)).toEqual({
            artifactId: 'art_123',
        });
    });

    test('leaves another Server, a foreign origin, and other App pages as plain links', () => {
        for (const href of [
            'https://app.haus.test/s/other/artifacts/art_123',
            'https://evil.test/s/acme/artifacts/art_123',
            'http://app.haus.test/s/acme/artifacts/art_123',
            '//evil.test/s/acme/artifacts/art_123',
            'https://app.haus.test/s/acme/artifacts',
            'https://app.haus.test/s/acme/artifacts/art_1/extra',
            'https://app.haus.test/s/acme/chats/art_123',
            'https://app.haus.test/s/acme/artifacts/workspaceFile:agent_1:page.html',
            'https://app.haus.test/s/acme/artifacts/notes',
            'haus://workspace/file?path=a.html',
            'mailto:art_1@haus.test',
        ]) {
            expect(parseSharedArtifactLink(href, scope)).toBeNull();
        }
    });

    test('reads nothing without a known App origin', () => {
        expect(
            parseSharedArtifactLink('https://app.haus.test/s/acme/artifacts/art_123', {
                origins: [],
                slug: 'acme',
            })
        ).toBeNull();
    });
});

describe('collectSharedArtifactLinks', () => {
    test('collects markdown and bare links once each, in reading order', () => {
        const content = [
            'Here is [the deck](https://app.haus.test/s/acme/artifacts/art_b).',
            'And the render: https://app.haus.test/s/acme/artifacts/art_a.',
            'Again https://app.haus.test/s/acme/artifacts/art_b and',
            'a foreign one https://evil.test/s/acme/artifacts/art_c',
        ].join('\n');

        expect(collectSharedArtifactLinks(content, scope)).toEqual([
            { artifactId: 'art_b' },
            { artifactId: 'art_a' },
        ]);
    });
});
