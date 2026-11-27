import { expect, test } from 'bun:test';
import { composeDriveConflictInput } from './inbox-drive-conflict-format.ts';

const base = { id: 'drive-conflict:run_8f2', pushId: 'run_8f2' };

test('a Drive conflict run renders one line per file and the guidance its outcomes need', () => {
    expect(
        composeDriveConflictInput(
            {
                ...base,
                files: [
                    {
                        copyPath: 'agents/blippy/notes/launch.conflict-blippy.md',
                        currentAuthorHandle: 'ada',
                        currentRevisionId: 'rev_1',
                        outcome: 'kept_both',
                        path: 'agents/blippy/notes/launch.md',
                        reason: 'same_lines',
                    },
                    {
                        copyPath: 'haus/logo.conflict-blippy.png',
                        currentAuthorHandle: 'tiny',
                        currentRevisionId: 'rev_2',
                        outcome: 'kept_both',
                        path: 'haus/logo.png',
                        reason: 'binary',
                    },
                    {
                        copyPath: null,
                        currentAuthorHandle: 'ada',
                        currentRevisionId: 'rev_3',
                        outcome: 'kept_edit',
                        path: 'haus/old-plan.md',
                        reason: 'edit_over_delete',
                    },
                    {
                        copyPath: null,
                        currentAuthorHandle: 'blippy',
                        currentRevisionId: 'rev_4',
                        outcome: 'kept_edit',
                        path: 'haus/brief.md',
                        reason: 'edit_over_delete',
                    },
                    {
                        copyPath: null,
                        currentAuthorHandle: null,
                        currentRevisionId: null,
                        outcome: 'refused',
                        path: 'agents/tiny/notes/x.md',
                        reason: 'FORBIDDEN',
                    },
                ],
                writer: { agentId: 'agt_blippy', type: 'agent' },
            },
            'blippy'
        )
    ).toBe(
        [
            '[drive conflict · 5 files · your push after run_8f2]',
            'agents/blippy/notes/launch.md · @ada changed the same lines · yours: agents/blippy/notes/launch.conflict-blippy.md',
            'haus/logo.png · binary, changed by @tiny · yours: haus/logo.conflict-blippy.png',
            'haus/old-plan.md · @ada edited it, so your delete did not happen',
            'haus/brief.md · it was deleted, and your edit brought it back',
            'agents/tiny/notes/x.md · refused, you cannot write there · yours: drive-refused/agents/tiny/notes/x.md',
            'Each original holds the current version and each copy holds yours. Merge what you still want into the original with ordinary file commands in drive/, then delete the copy.',
            'An edit always beats a delete. Delete the file again if you still mean to.',
            'A refused file is not in Drive: your version is in drive-refused/ in your working directory, and drive/ holds what Drive has.',
        ].join('\n')
    );
});
