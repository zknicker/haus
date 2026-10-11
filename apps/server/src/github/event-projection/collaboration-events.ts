import { count, field, flag, labelNames, list, login, type Payload, text } from './payload.ts';
import { clip } from './text-limits.ts';

// Projections for pull requests, reviews, pushes, issues, and releases. Bodies
// are author-written text: they are clipped here and reach the Agent only in
// the indented, untrusted excerpt.

const bodyMaxChars = 4000;
const commitMessageMaxChars = 200;
const pushCommitsMax = 20;

export function projectPullRequest(payload: Payload) {
    const pull = field(payload, 'pull_request');
    return { pull_request: pullFields(pull) };
}

export function projectPullRequestReview(payload: Payload) {
    const review = field(payload, 'review');
    const body = text(review, 'body');
    return {
        pull_request: pullFields(field(payload, 'pull_request'), { withBody: false }),
        review: {
            author: login(review, 'user'),
            author_association: text(review, 'author_association'),
            body: body === null ? null : clip(body, bodyMaxChars),
            html_url: text(review, 'html_url'),
            state: text(review, 'state')?.toLowerCase() ?? null,
        },
    };
}

export function projectPush(payload: Payload) {
    const commits = list(payload, 'commits');
    const head = field(payload, 'head_commit');
    return {
        push: {
            after: text(payload, 'after'),
            before: text(payload, 'before'),
            commit_count: commits.length,
            commits: commits.slice(0, pushCommitsMax).map(commitFields),
            compare: text(payload, 'compare'),
            forced: flag(payload, 'forced'),
            head_commit: head === null || head === undefined ? null : commitFields(head),
            pusher: text(field(payload, 'pusher'), 'name'),
            ref: text(payload, 'ref'),
        },
    };
}

export function projectIssue(payload: Payload) {
    const issue = field(payload, 'issue');
    const body = text(issue, 'body');
    return {
        issue: {
            assignees: logins(list(issue, 'assignees')),
            author: login(issue, 'user'),
            author_association: text(issue, 'author_association'),
            body: body === null ? null : clip(body, bodyMaxChars),
            html_url: text(issue, 'html_url'),
            labels: labelNames(issue),
            number: count(issue, 'number'),
            state: text(issue, 'state'),
            title: text(issue, 'title'),
        },
    };
}

export function projectRelease(payload: Payload) {
    const release = field(payload, 'release');
    const body = text(release, 'body');
    return {
        release: {
            author: login(release, 'author'),
            body: body === null ? null : clip(body, bodyMaxChars),
            draft: flag(release, 'draft'),
            html_url: text(release, 'html_url'),
            name: text(release, 'name'),
            prerelease: flag(release, 'prerelease'),
            tag_name: text(release, 'tag_name'),
        },
    };
}

function pullFields(pull: Payload, options: { withBody: boolean } = { withBody: true }) {
    const body = options.withBody ? text(pull, 'body') : null;
    return {
        author: login(pull, 'user'),
        author_association: text(pull, 'author_association'),
        base: text(field(pull, 'base'), 'ref'),
        ...(options.withBody ? { body: body === null ? null : clip(body, bodyMaxChars) } : {}),
        draft: flag(pull, 'draft'),
        head: text(field(pull, 'head'), 'ref'),
        html_url: text(pull, 'html_url'),
        labels: labelNames(pull),
        merged: flag(pull, 'merged'),
        number: count(pull, 'number'),
        requested_reviewers: logins(list(pull, 'requested_reviewers')),
        state: text(pull, 'state'),
        title: text(pull, 'title'),
    };
}

function commitFields(commit: Payload) {
    const message = text(commit, 'message');
    return {
        author: text(field(commit, 'author'), 'username') ?? text(field(commit, 'author'), 'name'),
        id: text(commit, 'id'),
        message: message === null ? null : clip(message, commitMessageMaxChars),
    };
}

function logins(users: unknown[]): string[] {
    return users
        .map((user) => text(user, 'login'))
        .filter((value): value is string => value !== null);
}
