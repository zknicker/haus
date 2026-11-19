import { describe, expect, test } from 'bun:test';
import { formatWorkerLink } from '@haus/api';
import { applyWorkerLinks } from './worker-links.ts';

const seen = 'caw_seenseenseenseen';
const other = 'caw_otherotherother1';
const hidden = 'caw_hiddenhiddenhid1';

describe('applyWorkerLinks', () => {
    test('keeps an allowed link and rewrites any other to its label', () => {
        const content = `See ${formatWorkerLink('Fix [it]', seen)} and [Secret](worker://${hidden}).`;
        expect(applyWorkerLinks(content, new Set([seen]))).toEqual({
            content: `See [Fix \\[it](worker://${seen}) and Secret.`,
            links: [{ ordinal: 0, workId: seen }],
        });
    });

    test('dedupes by first occurrence and keeps link order', () => {
        const content = [
            `[B](worker://${other})`,
            `[A](worker://${seen})`,
            `[B again](worker://${other})`,
        ].join(' ');
        expect(applyWorkerLinks(content, new Set([seen, other])).links).toEqual([
            { ordinal: 0, workId: other },
            { ordinal: 1, workId: seen },
        ]);
    });

    test('never lets a rewrite assemble a new unauthorized link', () => {
        const content = `[[x](worker://${hidden})](worker://${other})`;
        const resolved = applyWorkerLinks(content, new Set());
        expect(resolved.links).toEqual([]);
        expect(resolved.content).not.toContain('worker://');
    });

    test('leaves other references and plain text alone', () => {
        const content = 'Ask [@ada](user://usr_ada) in [#product](chat://cht_product).';
        expect(applyWorkerLinks(content, new Set())).toEqual({ content, links: [] });
    });

    test('replaying with the recorded links reproduces the stored content', () => {
        const authored = `[Mine](worker://${seen}) [Theirs](worker://${hidden})`;
        const stored = applyWorkerLinks(authored, new Set([seen]));
        const recorded = new Set(stored.links.map((link) => link.workId));
        expect(applyWorkerLinks(authored, recorded)).toEqual(stored);
    });
});
