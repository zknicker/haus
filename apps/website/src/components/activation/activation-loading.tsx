import { ActivationShell } from './activation-shell.tsx';

/** The same neutral frame spans session, route, and Server resolution. */
export function ActivationLoading() {
    return (
        <ActivationShell>
            <output className="sr-only">Opening Haus</output>
        </ActivationShell>
    );
}
