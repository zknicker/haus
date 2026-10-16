/**
 * The in-App page a provider flow (an OAuth or install page the App opened)
 * returned to: `url`'s path, query, and hash when it is on one of the App's
 * `origins` inside this Server's route (`/s/<slug>`), else null. A page on
 * another origin, or on the App outside this Server, is not a return.
 */
export function providerReturnPath(
    url: string,
    input: { origins: readonly string[]; serverPath: string }
): string | null {
    const parsed = URL.parse(url);
    if (!(parsed && input.origins.includes(parsed.origin))) {
        return null;
    }
    const within =
        parsed.pathname === input.serverPath || parsed.pathname.startsWith(`${input.serverPath}/`);
    return within ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
}
