import { expect, test } from 'bun:test';
import { isMergedRevision, revisionCompareBase } from './artifact-revision-base.ts';

const versions = [
    { parent_revision_id: 'rev_3', revision_id: 'rev_4' },
    { parent_revision_id: null, revision_id: 'rev_3' },
    { parent_revision_id: 'rev_1', revision_id: 'rev_2' },
    { parent_revision_id: null, revision_id: 'rev_1' },
];

test('a revision compares against the head it was committed on', () => {
    expect(revisionCompareBase(versions, 'rev_4')).toBe('rev_3');
    expect(revisionCompareBase(versions, 'rev_2')).toBe('rev_1');
});

test('a revision without a recorded head compares against the next older one', () => {
    expect(revisionCompareBase(versions, 'rev_3')).toBe('rev_2');
});

test('the first revision and an unknown one have nothing to compare against', () => {
    expect(revisionCompareBase(versions, 'rev_1')).toBe(null);
    expect(revisionCompareBase(versions, 'rev_9')).toBe(null);
});

test('a revision is merged when it was written from an older head than it landed on', () => {
    expect(isMergedRevision({ base_revision_id: 'rev_2', parent_revision_id: 'rev_3' })).toBe(true);
    expect(isMergedRevision({ base_revision_id: 'rev_3', parent_revision_id: 'rev_3' })).toBe(
        false
    );
    expect(isMergedRevision({ base_revision_id: null, parent_revision_id: 'rev_3' })).toBe(false);
});
