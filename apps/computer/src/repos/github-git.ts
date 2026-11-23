import { join } from 'node:path';
import type { GitIdentity } from '@haus/api';
import { computerEntrypoint } from '../build-identity.ts';

export type GithubGitSubject =
    | { access: 'write'; invocationId: string }
    | { access: 'read'; agentId: string };

export interface GithubAppGit {
    helper: string;
}

export const githubGitRefusalPrefix = 'haus: ';

export function githubAppGit(dataRoot: string, serverId: string, subject: GithubGitSubject) {
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

export function githubGitConfig(git: GithubAppGit | null) {
    const pairs: Array<readonly [string, string]> = [['credential.helper', '']];
    if (git === null) {
        return pairs;
    }
    pairs.push(
        ['credential.helper', git.helper],
        ['credential.https://github.com.useHttpPath', 'true'],
        ['url.https://github.com/.insteadOf', 'git@github.com:'],
        ['url.https://github.com/.insteadOf', 'ssh://git@github.com/'],
        ['url.https://github.com/.insteadOf', 'ssh://git@github.com:22/']
    );
    return pairs;
}

export function githubGitArgs(git: GithubAppGit | null) {
    return githubGitConfig(git).flatMap(([key, value]) => ['-c', `${key}=${value}`]);
}

export const unavailableBotEmail = 'haus-github-app-bot-unavailable-commit-again-shortly';

export function agentGitEnvironment(git: GithubAppGit, identity: GitIdentity | null) {
    const name = identity?.name ?? '';
    const email = identity?.email ?? unavailableBotEmail;
    return {
        ...gitConfigEnvironment(git),
        GIT_AUTHOR_EMAIL: email,
        GIT_AUTHOR_NAME: name,
        GIT_COMMITTER_EMAIL: email,
        GIT_COMMITTER_NAME: name,
    };
}

export function gitConfigEnvironment(git: GithubAppGit | null) {
    const pairs = githubGitConfig(git);
    const environment: Record<string, string> = {
        GIT_CONFIG_COUNT: String(pairs.length),
        GIT_TERMINAL_PROMPT: '0',
    };
    pairs.forEach(([key, value], index) => {
        environment[`GIT_CONFIG_KEY_${index}`] = key;
        environment[`GIT_CONFIG_VALUE_${index}`] = value;
    });
    return environment;
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
