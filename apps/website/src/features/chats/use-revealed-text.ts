import * as React from 'react';
import { useViewShown } from '../../hooks/desktop-tabs/view-shown.ts';

const defaultCatchUpWindowMs = 650;
const defaultMaxRevealCharsPerFrame = 12;
const defaultMaxRevealCharsPerSecond = 540;

interface RevealedTextOptions {
    catchUpWindowMs?: number;
    enabled: boolean;
    maxCharsPerFrame?: number;
    maxCharsPerSecond?: number;
    revealKey?: string;
}

interface RevealStepInput {
    carriedChars: number;
    catchUpWindowMs?: number;
    elapsedMs: number;
    maxCharsPerFrame?: number;
    maxCharsPerSecond?: number;
    remaining: number;
}

/**
 * Smooths streamed text by revealing it toward the latest target at a paced
 * rate instead of snapping on every network update. Bursty deltas smear into a
 * steady reveal: small backlogs catch up within roughly catchUpWindowMs, large
 * end-of-turn bursts are capped by maxCharsPerSecond, and delayed frames are
 * capped by maxCharsPerFrame so a stalled paint cannot dump multiple lines at
 * once. The reveal keeps running until it finishes even after the stream ends.
 * enabled only controls whether a newly mounted reveal starts hidden or fully
 * shown. When the new text does not extend what is already shown, the reveal
 * restarts from the shared prefix.
 */
export function useRevealedText(text: string, options: RevealedTextOptions | boolean) {
    const revealOptions = normalizeRevealOptions(options);
    const shouldReduceMotion = usePrefersReducedMotion();
    const catchUpWindowMs = revealOptions.catchUpWindowMs ?? defaultCatchUpWindowMs;
    const maxCharsPerFrame = revealOptions.maxCharsPerFrame ?? defaultMaxRevealCharsPerFrame;
    const maxCharsPerSecond = revealOptions.maxCharsPerSecond ?? defaultMaxRevealCharsPerSecond;
    const revealKey = revealOptions.revealKey ?? 'default';
    const [visibleLength, setVisibleLength] = React.useState(() =>
        revealOptions.enabled && !prefersReducedMotion() ? 0 : text.length
    );
    const visibleLengthRef = React.useRef(visibleLength);
    const viewShown = useViewShown();
    const targetRef = React.useRef(text);
    const revealKeyRef = React.useRef(revealKey);

    const commitVisibleLength = React.useCallback((nextVisibleLength: number) => {
        visibleLengthRef.current = nextVisibleLength;
        setVisibleLength(nextVisibleLength);
    }, []);

    React.useLayoutEffect(() => {
        const previous = targetRef.current;
        const previousVisibleLength = visibleLengthRef.current;
        const keyChanged = revealKeyRef.current !== revealKey;

        targetRef.current = text;
        revealKeyRef.current = revealKey;

        if (shouldReduceMotion) {
            commitVisibleLength(text.length);
            return;
        }

        if (keyChanged) {
            commitVisibleLength(revealOptions.enabled ? 0 : text.length);
            return;
        }

        if (!text.startsWith(previous.slice(0, Math.min(previousVisibleLength, previous.length)))) {
            commitVisibleLength(
                getReplacementVisibleLength({
                    next: text,
                    previous,
                    previousVisibleLength,
                })
            );
        }
    }, [commitVisibleLength, revealKey, revealOptions.enabled, shouldReduceMotion, text]);

    React.useEffect(() => {
        if (shouldReduceMotion) {
            commitVisibleLength(text.length);
            return;
        }

        if (visibleLengthRef.current >= targetRef.current.length) {
            return;
        }

        let frame = 0;
        let lastFrameAt = performance.now();
        let carriedChars = 0;

        const reveal = (now: number) => {
            const elapsedMs = Math.max(0, now - lastFrameAt);
            lastFrameAt = now;
            const current = visibleLengthRef.current;
            const targetLength = targetRef.current.length;
            const remaining = targetLength - current;

            if (remaining <= 0) {
                return;
            }

            // A hidden kept chat view (`KeptChatViews`) shows the text whole
            // rather than animating it unseen.
            if (!viewShown.isShown()) {
                commitVisibleLength(targetLength);
                return;
            }

            const nextStep = getRevealStep({
                carriedChars,
                catchUpWindowMs,
                elapsedMs,
                maxCharsPerFrame,
                maxCharsPerSecond,
                remaining,
            });

            carriedChars = nextStep.carriedChars;

            if (nextStep.step > 0) {
                commitVisibleLength(Math.min(targetLength, current + nextStep.step));
            }

            if (visibleLengthRef.current < targetRef.current.length) {
                frame = requestAnimationFrame(reveal);
            }
        };

        frame = requestAnimationFrame(reveal);

        return () => cancelAnimationFrame(frame);
    }, [
        catchUpWindowMs,
        commitVisibleLength,
        maxCharsPerFrame,
        maxCharsPerSecond,
        shouldReduceMotion,
        text,
        viewShown,
    ]);

    return text.slice(0, Math.min(visibleLength, text.length));
}

export function getRevealStep({
    carriedChars,
    catchUpWindowMs = defaultCatchUpWindowMs,
    elapsedMs,
    maxCharsPerFrame = defaultMaxRevealCharsPerFrame,
    maxCharsPerSecond = defaultMaxRevealCharsPerSecond,
    remaining,
}: RevealStepInput) {
    if (remaining <= 0 || elapsedMs <= 0 || maxCharsPerSecond <= 0) {
        return { carriedChars, step: 0 };
    }

    const nextCarriedChars = carriedChars + (elapsedMs * maxCharsPerSecond) / 1000;
    const budgetedChars = Math.floor(nextCarriedChars);

    if (budgetedChars <= 0) {
        return { carriedChars: nextCarriedChars, step: 0 };
    }

    const catchUpStep = Math.max(
        1,
        Math.ceil(remaining * Math.min(1, elapsedMs / catchUpWindowMs))
    );
    const frameStep = Math.max(1, Math.floor(maxCharsPerFrame));
    const step = Math.min(remaining, budgetedChars, catchUpStep, frameStep);

    return {
        carriedChars: nextCarriedChars - step,
        step,
    };
}

function normalizeRevealOptions(options: RevealedTextOptions | boolean): RevealedTextOptions {
    return typeof options === 'boolean' ? { enabled: options } : options;
}

export function commonPrefixLength(left: string, right: string) {
    const limit = Math.min(left.length, right.length);
    let index = 0;

    while (index < limit && left[index] === right[index]) {
        index += 1;
    }

    return index;
}

export function getReplacementVisibleLength({
    next,
    previous,
    previousVisibleLength,
}: {
    next: string;
    previous: string;
    previousVisibleLength: number;
}) {
    const visiblePrevious = previous.slice(0, Math.min(previousVisibleLength, previous.length));
    const rawPrefixLength = Math.min(commonPrefixLength(previous, next), next.length);
    const semanticPrefix = stripRevealFormatting(visiblePrevious);

    if (semanticPrefix.length === 0 || !startsWithRevealSemanticPrefix(next, semanticPrefix)) {
        return rawPrefixLength;
    }

    return getIndexAfterRevealSemanticPrefix(next, semanticPrefix) ?? rawPrefixLength;
}

function startsWithRevealSemanticPrefix(text: string, semanticPrefix: string) {
    return getIndexAfterRevealSemanticPrefix(text, semanticPrefix) !== null;
}

function getIndexAfterRevealSemanticPrefix(text: string, semanticPrefix: string) {
    let semanticIndex = 0;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index] ?? '';

        if (isRevealFormattingCharacter(character)) {
            continue;
        }

        if (character !== semanticPrefix[semanticIndex]) {
            return null;
        }

        semanticIndex += 1;

        if (semanticIndex === semanticPrefix.length) {
            return index + 1;
        }
    }

    return semanticIndex === semanticPrefix.length ? text.length : null;
}

function stripRevealFormatting(text: string) {
    let result = '';

    for (const character of text) {
        if (!isRevealFormattingCharacter(character)) {
            result += character;
        }
    }

    return result;
}

function isRevealFormattingCharacter(character: string) {
    return /[\s\p{P}]/u.test(character);
}

function usePrefersReducedMotion() {
    const [shouldReduceMotion, setShouldReduceMotion] = React.useState(prefersReducedMotion);
    const latest = React.useRef(shouldReduceMotion);

    React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        // A desktop tab reveal re-runs this effect in every reply; an
        // unchanged preference queues no render.
        const update = () => {
            if (latest.current !== query.matches) {
                latest.current = query.matches;
                setShouldReduceMotion(query.matches);
            }
        };

        update();
        query.addEventListener('change', update);

        return () => query.removeEventListener('change', update);
    }, []);

    return shouldReduceMotion;
}

function prefersReducedMotion() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}
