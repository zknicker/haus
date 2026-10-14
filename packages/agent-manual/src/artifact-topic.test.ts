import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('files')?.body ?? '';

test('files guidance opens with where files live and derives sharing from it', () => {
    expect(body.indexOf('## Where files live')).toBeLessThan(body.indexOf('## Browse'));
    expect(body).toContain('Files live in three places');
    expect(body).toContain('Your workspace is private');
    expect(body).toContain('as a snapshot its members can open');
    expect(body).toContain('every member can read and edit it');
    expect(body).toContain('the message carries its stable link rather than a copy');
    expect(body).toContain('a page rendered from a workbench `artifact` fence');
    expect(body).toContain('What someone shared with you in a DM stays in that conversation');
    expect(body).toContain('secrets stay out of Files');
    expect(body).not.toMatch(/\bdrive\b|Shared artifacts/u);
    expect(body).toContain('no one silently overwrites another member');
    // Retired if-then patches: the model and the list summary carry these now.
    expect(body).not.toContain('a search that finds nothing does not mean it is missing');
    expect(body).not.toContain('When someone says they just added something');
    expect(body).not.toContain('route around the size limit');
    expect(body).not.toMatch(/disk-full|macOS/u);
    expect(getManualTopic('files')?.related).toContain('attachment');
    expect(
        searchManualTopics('share file stable link versions', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('files');
});

test('attachment and recipe guidance point to the files model instead of restating it', () => {
    const attachment = getManualTopic('attachment');
    expect(attachment?.body).toContain('a snapshot that lives in the conversation');
    expect(attachment?.body).toContain('`haus files push`');
    expect(attachment?.body).not.toContain('Haus has two forms of file sharing.');
    expect(attachment?.related).toContain('files');
    const recipe = getManualTopic('recipes/technique/html-artifact-discussion');
    expect(recipe?.body).toContain('each later round by pushing the same file again');
    expect(recipe?.kind === 'recipe' && recipe.prereqs).toEqual(['artifact fence']);
    expect(getManualTopic('haus-cli-overview')?.body).toContain('haus files,');
});

test('files guidance teaches Files: list, pull, push, conflicts, links, and deletion', () => {
    for (const command of [
        'haus files list [<folder>]',
        'haus files pull <folder>',
        'haus files push <local-file-or-folder>',
        'haus files mv <from> <to>',
        'haus files view <id>',
        'versions <id-or-path>',
        'haus files delete <id-or-path>',
    ]) {
        expect(body).toContain(command);
    }
    expect(body).toContain('It opens with `summary`');
    expect(body).toContain('`files_in_folders`');
    expect(body).toContain('both newest first');
    expect(body).toContain('`--query <text>`');
    expect(body).toContain('`--mine`');
    expect(body).toContain('Give files their real extension');
    expect(body).toContain('Push is checked against what you pulled.');
    expect(body).toContain('`<file>.haus-theirs`');
    expect(body).toContain('Merge their changes into your file');
    expect(body).toContain('use it only when that is deliberate');
    expect(body).toContain('`.haus-artifacts.json`. It is bookkeeping');
    expect(body).toContain('ARTIFACT_PUBLISH_UNCONFIRMED');
    expect(body).toContain('Push skips symlinks');
    expect(body).toContain('renders a link to a file in its own Server');
    expect(body).toContain('treat deleting anything you did not create as a human decision');
    expect(body).not.toContain('--json');
    expect(body).not.toMatch(/--name|--artifact-id|artifact publish|named from the filename/u);
    expect(body).not.toContain('haus artifact');
});
