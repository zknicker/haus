import { expect, test } from 'bun:test';
import { getManualTopic, resolveManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('repos')?.body ?? '';

test('repos belong to the Server and haus repo list shows the folders on each Computer', () => {
    expect(body).toContain(
        "A repo is a GitHub `owner/name` on the Server's list, and any Agent in any Project can use any of them."
    );
    expect(body).toContain(
        '`haus repo list` shows each repo and the Computers with a folder for it.'
    );
    expect(body).toContain('`haus-computer repo add <path>`');
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

test('Agents push and open pull requests as the bot, with a co-author trailer per asker', () => {
    expect(body).toContain("as the Server's Haus GitHub App");
    expect(body).toContain('`haus repo co-author @handle [@handle...]` prints the lines');
    expect(body).toContain(
        '`Co-authored-by:` trailer for each person whose message you are acting on'
    );
    expect(body).toContain('Push with plain `git push -u origin HEAD`');
    expect(body).toContain("never the machine's own GitHub login");
    expect(body).toContain("with the GitHub connection's `create_pull_request`");
    expect(body).toContain('the error names which, and who can fix it');
});

test('the repo family noun and its words resolve to the repos topic', () => {
    expect(resolveManualTopic('repo')?.id).toBe('repos');
    expect(resolveManualTopic('worktree')?.id).toBe('repos');
    expect(
        searchManualTopics('repo checkout worktree', { limit: 3, scope: 'all' }).map(({ id }) => id)
    ).toContain('repos');
});
