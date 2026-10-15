// `HAUS_LINEAR_API_ORIGIN`: a loopback stand-in for api.linear.app, so a live
// development or eval stack can run Linear flows with no call leaving the
// machine (scripts/agent-tests/fake-linear.mjs). Only loopback origins are
// accepted, so a misconfigured deployment can never send a Linear token
// anywhere but Linear or the local machine.

const linearApiOrigin = 'https://api.linear.app';
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Global fetch, or one that sends every api.linear.app request to `origin` instead. */
export function linearTransport(origin: string | undefined): typeof fetch {
    if (!origin) {
        return fetch;
    }
    const target = new URL(origin);
    if (!loopbackHosts.has(target.hostname)) {
        throw new Error('HAUS_LINEAR_API_ORIGIN must be a loopback origin.');
    }
    const transport = (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.origin !== linearApiOrigin) {
            return fetch(input, init);
        }
        return fetch(new URL(`${url.pathname}${url.search}`, target.origin), init);
    };
    return transport as typeof fetch;
}
