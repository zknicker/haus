import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';
import { resolveManualTopic } from './search.ts';

const body = getManualTopic('computers')?.body ?? '';

test('the computers topic teaches a per-call target with no sticky switch', () => {
    expect(body).toContain('every tool call that names no Computer runs there');
    expect(body).toContain(
        "`bash`, `str_replace_based_edit_tool`, `shell`, `apply_patch`, `view_image`, and `execute`'s `browser` and `desktop` built-ins, whose input is `{ args, computer }`"
    );
    expect(body).toContain('name the Computer on every call that should run there');
    expect(body).toContain('A named Computer never falls back to your home.');
});

test('it explains haus computer list, who grants access, and every refusal cause', () => {
    expect(body).toContain('`haus computer list`');
    expect(body).toContain('only after the person who attached it adds you');
    expect(body).toContain('Owners and Admins can only remove you');
    for (const cause of ['not-found', 'no-access', 'not-listed', 'offline']) {
        expect(body).toContain(`\`${cause}\``);
    }
});

test('it says where off-home calls run, that Drive stays home, and that the folders are scratch', () => {
    expect(body).toContain('with `HOME` set to its sibling `home`');
    expect(body).toContain('That folder has no `drive/`: Drive stays on your home.');
    expect(body).toContain('reach a person\'s files by absolute path');
    expect(body).toContain('Full Reset recreates only your home\'s folders');
});

test('a MacBook screenshot uploads from the same Computer the desktop call targeted', () => {
    expect(body).toContain(
        '`desktop` with `{ args: ["screenshot", "/tmp/shot.png"], computer: "macbook" }`'
    );
    expect(body).toContain(
        '`bash` with `computer: "macbook"` running `haus attachment upload --path /tmp/shot.png`'
    );
    expect(body).toContain('`haus attachment view <id> --output <path>` in a call that targets the second');
});

test('an Agent asking about another machine finds the computers topic', () => {
    expect(resolveManualTopic('computer')?.id).toBe('computers');
    expect(resolveManualTopic('home computer')?.id).toBe('computers');
    for (const query of ['screenshot my macbook', 'run on another computer', 'computer list']) {
        expect(searchManualTopics(query, { limit: 5, scope: 'all' }).map(({ id }) => id)).toContain(
            'computers'
        );
    }
});
