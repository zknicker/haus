import {
    type WorkerBranch,
    type WorkerObservedResult,
    type WorkerReportOutcome,
    workerReportOutcomeSchema,
} from '@haus/api';

const resultTextMaxLength = 65_536;
const handleMaxLength = 128;
const pullRequestUrlMaxLength = 2000;
const pullRequestsMax = 50;
const hausLine = /^Haus-(Outcome|Person):(.*)$/iu;
const githubPullRequest = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/gu;

export function observedResultOf(finalText: string, branches: readonly WorkerBranch[] = []) {
    const lines = finalText.trimEnd().split(/\r?\n/u);
    let outcome: WorkerReportOutcome | null = null;
    let personHandle: string | null = null;
    let end = lines.length;
    while (end > 0) {
        const line = lines[end - 1]?.trim() ?? '';
        const match = line ? hausLine.exec(line) : null;
        if (line && !match) {
            break;
        }
        const value = match?.[2]?.trim() ?? '';
        if (match?.[1]?.toLowerCase() === 'outcome') {
            const parsed = workerReportOutcomeSchema.safeParse(value.toLowerCase());
            if (!parsed.success || outcome !== null) {
                break;
            }
            outcome = parsed.data;
        } else if (match) {
            const handle = value.replace(/^@/u, '').slice(0, handleMaxLength);
            if (!handle || personHandle !== null) {
                break;
            }
            personHandle = handle;
        }
        end -= 1;
    }
    const text = lines.slice(0, end).join('\n').trim();
    return {
        outcome,
        personHandle,
        pullRequestUrls: pullRequestUrlsOf(text, branches),
        text: text.slice(0, resultTextMaxLength),
    } satisfies WorkerObservedResult;
}

function pullRequestUrlsOf(text: string, branches: readonly WorkerBranch[]) {
    const named = [
        ...(text.match(githubPullRequest) ?? []),
        ...branches.flatMap((branch) => branch.pullRequestUrl?.match(githubPullRequest) ?? []),
    ];
    return [...new Set(named)]
        .filter((url) => url.length <= pullRequestUrlMaxLength)
        .slice(0, pullRequestsMax);
}
