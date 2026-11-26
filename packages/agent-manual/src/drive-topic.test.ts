import { expect, test } from 'bun:test';
import { getManualTopic, resolveManualTopic, searchManualTopics } from './index.ts';

const body = getManualTopic('drive')?.body ?? '';

test('drive guidance opens with where files live and derives sharing from it', () => {
    expect(body.indexOf('## Where files live')).toBeLessThan(body.indexOf('## Your drive/ folder'));
    expect(body).toContain('Files live in three places');
    expect(body).toContain('Server Owners and Admins can inspect it');
    expect(body).toContain('A page is a live view of a file in your workspace');
    expect(body).toContain('attach the file or copy it into Drive and cite it');
    expect(body).toContain('the message cites it rather than carrying a copy');
    expect(body).toContain('Secrets stay out of Drive');
    expect(
        searchManualTopics('share file stable link versions', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('drive');
    expect(resolveManualTopic('files')).toBeNull();
});

test('drive guidance teaches the folder, its areas, and native file commands', () => {
    for (const area of ['`drive/haus/`', '`drive/projects/<key>/`', '`drive/agents/<handle>/`']) {
        expect(body).toContain(area);
    }
    expect(body).toContain('`ls`, `cat`, `rg`, your edit tool, `mv`, `rm`');
    expect(body).toContain("another Agent's area is read-only to you");
    expect(body).toContain(
        'refreshes the folder when your turn starts and sends your changes when it ends'
    );
    expect(body).not.toMatch(
        /haus (files|drive) (pull|push|list|mv|delete)|\.haus-theirs|\.haus-artifacts/u
    );
});

test('drive guidance teaches conflicts, refusals, and the drive_conflict wake', () => {
    expect(body).toContain('`<stem>.conflict-<your handle>.<ext>`');
    expect(body).toContain('`drive-refused/<path>`');
    expect(body).toContain('`drive_conflict` turn');
    expect(body).toContain('Merge your copy into the original and delete the copy');
});

test('drive guidance teaches drive:// citations and the three haus drive commands', () => {
    expect(body).toContain('`[label](drive://<path>)`');
    expect(body).toContain('`[Q4 report](drive://haus/reports/q4.md)`');
    for (const command of [
        'haus drive view <id|link|path>',
        'haus drive versions <id|link|path>',
        'haus drive share <id|link|path>',
    ]) {
        expect(body).toContain(command);
    }
    expect(body).toContain('Share only when asked or when the destination is outside Haus');
    expect(body).not.toContain('--json');
});

test('attachment and recipe guidance point to the drive model instead of restating it', () => {
    const attachment = getManualTopic('attachment');
    expect(attachment?.body).toContain('a snapshot that lives in the conversation');
    expect(attachment?.body).toContain('The `drive` topic covers where else files live');
    expect(attachment?.related).toContain('drive');
    const recipe = getManualTopic('recipes/technique/html-artifact-discussion');
    expect(recipe?.body).toContain('copy it into your `drive/` folder');
    expect(recipe?.body).toContain('`haus drive versions` lists them');
    expect(recipe?.body).not.toContain('haus files');
    expect(getManualTopic('haus-cli-overview')?.body).toContain('haus drive,');
});
