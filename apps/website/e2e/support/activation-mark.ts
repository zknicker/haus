import { expect, type Page } from '@playwright/test';

/** Observe even a single committed loading scene between setup and the App. */
export async function watchActivationMark(page: Page) {
    const observation = await page.evaluateHandle(() => {
        const state = { flashed: false };
        const observer = new MutationObserver(() => {
            const scene = document.querySelector('.activation-scene');
            if (scene && !scene.hasAttribute('data-hide-mark')) {
                state.flashed = true;
            }
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
        return { observer, state };
    });
    return async () => {
        const flashed = await observation.evaluate(({ observer, state }) => {
            observer.disconnect();
            return state.flashed;
        });
        await observation.dispose();
        expect(flashed, 'The activation ghost must stay hidden during the Cove handoff').toBe(
            false
        );
    };
}
