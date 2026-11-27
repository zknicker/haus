import { expect, test } from 'bun:test';
import { findComputerCommandHelp, resolveComputerHelpRequest } from './help.ts';
import { readRepoCall } from './repo-command.ts';

test('repo arguments read a folder path apart from the Server slug that may follow it', () => {
    expect(readRepoCall(['add', '/code'])).toEqual({ kind: 'add', path: '/code', slug: undefined });
    expect(readRepoCall(['add', '.', '/hq'])).toEqual({ kind: 'add', path: '.', slug: 'hq' });
    expect(readRepoCall(['list'])).toEqual({ kind: 'list', slug: undefined });
    expect(readRepoCall(['list', '/hq'])).toEqual({ kind: 'list', slug: 'hq' });
    expect(readRepoCall(['remove', 'Acme/App', '/hq'])).toEqual({
        kind: 'remove',
        repository: 'acme/app',
        slug: 'hq',
    });
});

test('repo refuses a missing action, a bad repo, and a bad Server slug', () => {
    expect(() => readRepoCall([])).toThrow('Run haus-computer repo add <path>');
    expect(() => readRepoCall(['remove', 'app'])).toThrow(
        '"app" is not a repo. A repo reads as owner/name.'
    );
    expect(() => readRepoCall(['add', '/code', 'hq'])).toThrow(
        'Choose a Server as /server-slug, not "hq".'
    );
});

test('repo has a help page that names the folder risk', () => {
    expect(resolveComputerHelpRequest(['repo', '--help'])?.kind).toBe('command');
    expect(findComputerCommandHelp('repo')?.notes).toContain(
        'A Task can change its branches, including main, and its hooks and config.'
    );
});
