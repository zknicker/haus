import { InputGroup, TextField, Toolbar } from '@heroui/react';
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import type { BrowserFindResult, BrowserTab } from '../../lib/desktop-browser.ts';
import { PageToolbarButton, pageToolbarClassName } from './page-toolbar.tsx';

/**
 * Find in page (⌘F) for one browser tab. It is a row under the toolbar, not an
 * overlay: the page region shrinks by its height, so the live native page stays
 * visible instead of swapping to a snapshot (see useBrowserViewBounds).
 */
export function BrowserFindBar({ tab }: { tab: BrowserTab }) {
    const find = useBrowserViews()?.find;
    const input = React.useRef<HTMLInputElement>(null);
    const open = find?.tabId === tab.id;
    const focusRequest = find?.focusRequest;
    React.useEffect(() => {
        if (open && focusRequest !== undefined) {
            input.current?.focus();
            input.current?.select();
        }
    }, [open, focusRequest]);
    if (!(find && open)) {
        return null;
    }
    return (
        <div
            className={`${pageToolbarClassName} browser-find-bar flex shrink-0 items-center justify-end`}
        >
            <TextField
                aria-label="Find in page"
                className="w-64"
                onChange={find.setText}
                value={find.text}
            >
                <InputGroup fullWidth>
                    <InputGroup.Input
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                find.step(!event.shiftKey);
                            } else if (event.key === 'Escape') {
                                event.preventDefault();
                                find.close();
                            }
                        }}
                        placeholder="Find in page"
                        ref={input}
                    />
                    <InputGroup.Suffix>
                        <span aria-live="polite" className="text-muted text-xs tabular-nums">
                            {find.text ? matchLabel(tab.find) : null}
                        </span>
                    </InputGroup.Suffix>
                </InputGroup>
            </TextField>
            <Toolbar aria-label="Find actions">
                <PageToolbarButton
                    icon={<Icon icon={ArrowUp01Icon} size={16} />}
                    isDisabled={!tab.find?.matches}
                    label="Previous match"
                    onPress={() => find.step(false)}
                    shortcut="⇧⌘G"
                />
                <PageToolbarButton
                    icon={<Icon icon={ArrowDown01Icon} size={16} />}
                    isDisabled={!tab.find?.matches}
                    label="Next match"
                    onPress={() => find.step(true)}
                    shortcut="⌘G"
                />
                <PageToolbarButton
                    icon={<Icon icon={Cancel01Icon} size={16} />}
                    label="Close find"
                    onPress={find.close}
                    shortcut="Esc"
                />
            </Toolbar>
        </div>
    );
}

function matchLabel(result: BrowserFindResult | null) {
    if (!result) {
        return null;
    }
    return result.matches > 0 ? `${result.activeMatch} of ${result.matches}` : 'No results';
}
