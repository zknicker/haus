import { expect, test } from 'bun:test';
import type { DriveCitation } from '@haus/api';
import { driveCitationTarget } from './drive-citation-link.ts';

const citations: DriveCitation[] = [
    { artifactId: 'art_worker', path: 'agents/blippy/WORKER.md', revisionId: 'rev_3' },
    { artifactId: null, path: 'notes/later.md', revisionId: null },
    { artifactId: 'art_plan', path: 'plans/Q4 plan.md', revisionId: 'rev_9' },
];

test('a resolved citation opens its cited revision', () => {
    expect(driveCitationTarget('drive://agents/blippy/WORKER.md', citations)).toEqual({
        artifactId: 'art_worker',
        revisionId: 'rev_3',
    });
});

test('a citation whose path did not exist yet resolves to nothing', () => {
    expect(driveCitationTarget('drive://notes/later.md', citations)).toBeNull();
});

test('a path the message did not cite resolves to nothing', () => {
    expect(driveCitationTarget('drive://agents/tiny/WORKER.md', citations)).toBeNull();
});

test('a percent-encoded path matches its citation', () => {
    expect(driveCitationTarget('drive://plans/Q4%20plan.md', citations)).toEqual({
        artifactId: 'art_plan',
        revisionId: 'rev_9',
    });
});

test('a path matches its citation by key, ignoring case', () => {
    expect(driveCitationTarget('drive://Agents/Blippy/worker.md', citations)).toEqual({
        artifactId: 'art_worker',
        revisionId: 'rev_3',
    });
});

test('a malformed encoding and a non-drive link resolve to nothing', () => {
    expect(driveCitationTarget('drive://plans/%E0%A4%A.md', citations)).toBeNull();
    expect(driveCitationTarget('https://haus.test/agents/blippy/WORKER.md', citations)).toBeNull();
});
