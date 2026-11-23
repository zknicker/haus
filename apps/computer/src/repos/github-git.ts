import { join } from 'node:path';
import type { GitIdentity } from '@haus/api';
import { computerEntrypoint } from '../build-identity.ts';

/**
 * Whose git token the helper asks the Server for: an open Agent command, which
 * may push, or the Computer's own cleanup fetch of one Agent's worktree.
 */
export type GithubGitSubject =
    | { access: 'write'; invocationId: string }
    | { access: 'read'; agentId: string };

/** Git that reaches GitHub only as the Haus GitHub App, through the Computer's helper. */
export interface GithubAppGit {
    helper: string;
}

/** The helper's refusal line on stderr; Haus lifts it out of git's own failure. */
export const githubGitRefusalPrefix = 'haus: ';

export function githubAppGit(
    dataRoot: string,
    serverId: string,
    subject: GithubGitSubject
) {
    const entrypoint = computerEntrypoint();
    const words = [
        entrypoint.executable,
        ...entrypoint.args,
        '__git-credential',
        join(dataRoot, 'servers', serverId),
        subject.access === 'write' ? subject.invocationId : subject.agentId,
    ];
    const git: GithubAppGit = { helper: `!${words.map(shellQuote).join(' ')}` };
    return git;
}

/**
 * Config that keeps a person's own git login out: it drops every inherited
 * credential helper (Apple's git ships `osxkeychain` in its system config), adds
 * the Haus helper for GitHub, and sends GitHub SSH remotes over HTTPS so the
 * helper answers for them too.
 */
export function githubGitConfig(git: GithubAppGit | null) {
    const pairs: Array<readonly [string, string]> = [['credential.helper', '']];
    if (git === null) {
        return pairs;
    }
    pairs.push(
        ['credential.helper', git.helper],
        ['credential.https://github.com.useHttpPath', 'true'],
        ['url.https://github.com/.insteadOf', 'git@github.com:'],
        ['url.https://github.com/.insteadOf', 'ssh://git@github.com/']
    );
    return pairs;
}

/** The same config as `-c` arguments, for git the Computer runs itself. */
export function githubGitArgs(git: GithubAppGit | null) {
    return githubGitConfig(git).flatMap(([key, value]) => ['-c', `${key}=${value}`]);
}

/**
 * The environment every Agent command gets: the config above, scoped to its
 * processes through `GIT_CONFIG_*`, and the bot as author and committer. No
 * token is in it; git asks the helper only when GitHub answers 401.
 */
export function agentGitEnvironment(git: GithubAppGit | null, identity: GitIdentity | null) {
    const pairs = githubGitConfig(git);
    const environment: Record<string, string> = {
        GIT_CONFIG_COUNT: String(pairs.length),
        GIT_TERMINAL_PROMPT: '0',
    };
    pairs.forEach(([key, value], index) => {
        environment[`GIT_CONFIG_KEY_${index}`] = key;
        environment[`GIT_CONFIG_VALUE_${index}`] = value;
    });
    if (identity) {
        environment.GIT_AUTHOR_NAME = identity.name;
        environment.GIT_AUTHOR_EMAIL = identity.email;
        environment.GIT_COMMITTER_NAME = identity.name;
        environment.GIT_COMMITTER_EMAIL = identity.email;
    }
    return environment;
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
