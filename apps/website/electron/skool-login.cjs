'use strict';

/** A dedicated Skool view only; cookies from unrelated tabs never cross this boundary. */
function waitForSkoolSession(contents, { timeoutMs = 180_000 } = {}) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let reading = false;
        const finish = (error, session) => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timeout);
            clearInterval(poll);
            contents.removeListener('destroyed', closed);
            if (error) {
                reject(error);
            } else {
                resolve(session);
            }
        };
        const closed = () => finish(new Error('Skool sign-in was canceled.'));
        const read = async () => {
            if (finished || reading || contents.isDestroyed()) {
                return;
            }
            reading = true;
            try {
                const currentUrl = contents.getURL();
                if (!currentUrl) {
                    return;
                }
                const url = new URL(currentUrl);
                if (url.origin !== 'https://www.skool.com' || url.pathname.startsWith('/login')) {
                    return;
                }
                const cookies = await contents.session.cookies.get({
                    url: 'https://www.skool.com/',
                });
                const auth = cookies.find((cookie) => cookie.name === 'auth_token')?.value;
                const waf = cookies.find((cookie) => cookie.name === 'aws-waf-token')?.value;
                if (auth && waf) {
                    finish(null, {
                        auth_token: auth,
                        waf_token: waf,
                        cookie_header: cookies
                            .map((cookie) => `${cookie.name}=${cookie.value}`)
                            .join('; '),
                    });
                }
            } catch {
                finish(new Error('Could not read the Skool sign-in session.'));
            } finally {
                reading = false;
            }
        };
        const timeout = setTimeout(
            () => finish(new Error('Skool sign-in timed out. Try again.')),
            timeoutMs
        );
        const poll = setInterval(read, 500);
        contents.once('destroyed', closed);
        void read();
    });
}

module.exports = { waitForSkoolSession };
