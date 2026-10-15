import { useSearchParams } from 'react-router-dom';

const linearSetupParam = 'linear_setup';

/**
 * The outcome Linear's install callback carried back (`?linear_setup=`): a
 * binding kind such as `workspace_connected`, or a refusal reason. The URL
 * owns it, so a reload still shows it until the reader dismisses it.
 */
export function useLinearSetupOutcome() {
    const [searchParams, setSearchParams] = useSearchParams();
    const outcome = searchParams.get(linearSetupParam);

    return {
        dismiss: () =>
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.delete(linearSetupParam);
                    return next;
                },
                { replace: true }
            ),
        outcome: outcome && outcome.length > 0 ? outcome : null,
    };
}
