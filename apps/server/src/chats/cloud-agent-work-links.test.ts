import { describe, expect, test } from 'bun:test';
import { formatCloudAgentWorkLink } from '@haus/api';
import { applyCloudAgentWorkLinks } from './cloud-agent-work-links.ts';

const seen = 'caw_seenseenseenseen';
const other = 'caw_otherotherother1';
const hidden = 'caw_hiddenhiddenhid1';

describe('applyCloudAgentWorkLinks', () => {
    test('keeps an allowed link and rewrites any other to its label', () => {
        const content = `See ${formatCloudAgentWorkLink('Fix [it]', seen)} and [Secret](cloud-agent://${hidden}).`;
        expect(applyCloudAgentWorkLinks(content, new Set([seen]))).toEqual({
            content: `See [Fix \\[it](cloud-agent://${seen}) and Secret.`,
            links: [{ ordinal: 0, workId: seen }],
        });
    });

    test('dedupes by first occurrence and keeps link order', () => {
        const content = [
            `[B](cloud-agent://${other})`,
            `[A](cloud-agent://${seen})`,
            `[B again](cloud-agent://${other})`,
        ].join(' ');
        expect(applyCloudAgentWorkLinks(content, new Set([seen, other])).links).toEqual([
            { ordinal: 0, workId: other },
            { ordinal: 1, workId: seen },
        ]);
    });

    test('never lets a rewrite assemble a new unauthorized link', () => {
        const content = `[[x](cloud-agent://${hidden})](cloud-agent://${other})`;
        const resolved = applyCloudAgentWorkLinks(content, new Set());
        expect(resolved.links).toEqual([]);
        expect(resolved.content).not.toContain('cloud-agent://');
    });

    test('leaves other references and plain text alone', () => {
        const content = 'Ask [@ada](user://usr_ada) in [#product](chat://cht_product).';
        expect(applyCloudAgentWorkLinks(content, new Set())).toEqual({ content, links: [] });
    });

    test('replaying with the recorded links reproduces the stored content', () => {
        const authored = `[Mine](cloud-agent://${seen}) [Theirs](cloud-agent://${hidden})`;
        const stored = applyCloudAgentWorkLinks(authored, new Set([seen]));
        const recorded = new Set(stored.links.map((link) => link.workId));
        expect(applyCloudAgentWorkLinks(authored, recorded)).toEqual(stored);
    });
});
