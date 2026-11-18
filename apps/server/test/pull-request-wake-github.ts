export interface PullRequestWakeReading {
    checks: 'failing' | 'passing' | 'pending';
    draft: boolean;
}

export function respondAsGithub(
    path: string,
    pull: PullRequestWakeReading,
    headSha: string
): Response {
    if (path.endsWith('/access_tokens')) {
        return Response.json({
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            token: 'ghs_installation',
        });
    }
    if (/\/pulls\/\d+$/u.test(path)) {
        return Response.json({
            additions: 10,
            changed_files: 3,
            closed_at: null,
            deletions: 1,
            draft: pull.draft,
            head: { sha: headSha },
            merged_at: null,
            state: 'open',
            title: 'Fix flaky login test',
        });
    }
    if (path.endsWith('/reviews')) {
        return Response.json([]);
    }
    if (path.endsWith('/check-runs')) {
        return Response.json({
            check_runs: [
                pull.checks === 'pending'
                    ? { conclusion: null, status: 'in_progress' }
                    : {
                          conclusion: pull.checks === 'passing' ? 'success' : 'failure',
                          status: 'completed',
                      },
            ],
        });
    }
    return Response.json({ statuses: [] });
}
