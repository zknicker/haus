import { createPath, type Path, resolvePath } from 'react-router-dom';

export function skipsSameRoutePush(input: {
    desktop: boolean;
    href: string;
    location: Path;
    replace?: boolean | undefined;
}) {
    if (input.desktop || input.replace) {
        return false;
    }
    const { hash, pathname, search } = input.location;
    return createPath(resolvePath(input.href, pathname)) === createPath({ hash, pathname, search });
}
