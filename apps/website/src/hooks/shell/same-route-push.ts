import { parsePath } from 'react-router-dom';

export function skipsSameRoutePush(input: {
    desktop: boolean;
    href: string;
    location: { pathname: string; search: string };
    replace?: boolean | undefined;
}) {
    if (input.desktop || input.replace) {
        return false;
    }
    const target = parsePath(input.href);
    return (
        (target.pathname ?? input.location.pathname) === input.location.pathname &&
        (target.search ?? '') === input.location.search
    );
}
