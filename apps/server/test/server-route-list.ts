export function listRoutes(tree: string) {
    const stack: string[] = [];
    return tree.split('\n').flatMap((line) => {
        const match = /^(?<indent>[│ ]*)[├└]── (?<path>\S+)(?: \((?<methods>[^)]+)\))?$/u.exec(
            line
        );
        const { indent = '', methods = '', path = '' } = match?.groups ?? {};
        const depth = indent.length / 4;
        stack.length = depth;
        const url = `${stack.join('')}${path}`;
        stack.push(path);
        return match && methods
            ? methods
                  .split(', ')
                  .filter((method) => method !== 'HEAD')
                  .map((method) => ({ method, url }))
            : [];
    });
}
