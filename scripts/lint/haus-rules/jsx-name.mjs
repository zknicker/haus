/** `<Modal.Header>` → `Modal.Header`, `<div>` → `div`; anything else → null. */
export function jsxName(element) {
    const name = element?.openingElement?.name;
    if (name?.type === 'JSXIdentifier') {
        return name.name;
    }
    if (
        name?.type === 'JSXMemberExpression' &&
        name.object.type === 'JSXIdentifier' &&
        name.property.type === 'JSXIdentifier'
    ) {
        return `${name.object.name}.${name.property.name}`;
    }
    return null;
}
