import { expect, test } from 'bun:test';
import { getManualTopic, resolveManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('repos')?.body ?? '';

test('repos belong to the Server and haus repo list shows the folders on each Computer', () => {
    expect(body).toContain(
        "A repo is a GitHub `owner/name` on the Server's list, and any Agent or Worker in any Project can use any of them."
    );
    expect(body).toContain(
        '`haus repo list` shows each repo and the Computers with a folder for it.'
    );
    expect(body).toContain('`haus-computer repo add <path>`');
    expect(body).toContain('A Worker can use a repo with no folder: its Computer clones it first');
});

test('haus repo checkout makes your own worktree on a named branch, only where a folder exists', () => {
    expect(body).toContain('`haus repo checkout <owner/name> [--ref <ref>]`');
    expect(body).toContain('on your own branch `haus/<agent-id>/<name>`');
    expect(body).toContain('`cd` into the path and work there');
    expect(body).toContain(
        'A different `--ref` resets a clean worktree to that ref and refuses one with uncommitted or unpushed work.'
    );
    expect(body).toContain('it never clones');
    expect(body).toContain('ask the person who attached that Computer to add one');
    expect(body).toContain('goes 7 days after its last use, and the branch stays');
});

test('the repos topic teaches no pushing or pull requests from a checkout', () => {
    expect(body).not.toMatch(/git push|pull request|Co-authored-by/iu);
});

test('the repo family noun and its words resolve to the repos topic', () => {
    expect(resolveManualTopic('repo')?.id).toBe('repos');
    expect(resolveManualTopic('worktree')?.id).toBe('repos');
    expect(
        searchManualTopics('repo checkout worktree', { limit: 3, scope: 'all' }).map(({ id }) => id)
    ).toContain('repos');
});
