import { parseGithubPullRequestUrl, workerReportReceiptSchema } from '@haus/api';
import { readJsonFile } from '../durable-json.ts';
import type { PullRequestReader } from '../github/pull-request-reader.ts';
import type { WorkerLayout } from './layout.ts';

export async function reportedBranches(input: {
    branch: string | null;
    layout: WorkerLayout;
    reader: PullRequestReader;
    turnId: string;
}) {
    const receipt = workerReportReceiptSchema.safeParse(
        await readJsonFile(input.layout.reportFile).catch(() => null)
    );
    if (!(input.branch && receipt.success && receipt.data.turnId === input.turnId)) {
        return [];
    }
    const branch = input.branch;
    const pullRequests = receipt.data.draft.pullRequestUrls.flatMap((url) => {
        const parsed = parseGithubPullRequestUrl(url);
        return parsed ? [{ repository: parsed.repository, url }] : [];
    });
    return await Promise.all(
        pullRequests.map(async ({ repository, url }) => ({
            branch,
            pullRequest: await input.reader
                .read(url, AbortSignal.timeout(10_000))
                .catch(() => null),
            pullRequestUrl: url,
            repository,
        }))
    );
}
