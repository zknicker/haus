import { useSearchParams } from 'react-router-dom';

const githubSetupParam = 'github_setup';

/**
 * The outcome GitHub's setup redirect carried back (`?github_setup=`): `bound`,
 * `requested`, or a refusal reason. The URL owns it, so a reload still shows
 * it until the reader dismisses it.
 */
export function useGithubSetupOutcome() {
    const [searchParams, setSearchParams] = useSearchParams();
    const outcome = searchParams.get(githubSetupParam);

    return {
        dismiss: () =>
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.delete(githubSetupParam);
                    return next;
                },
                { replace: true }
            ),
        outcome: outcome && outcome.length > 0 ? outcome : null,
    };
}
