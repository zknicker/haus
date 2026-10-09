/**
 * The least DOM `react-dom/client` needs to mount, update, and hide
 * (`<Activity>`) a tree under `bun test`, which has no DOM. Enough to assert
 * React identity (a component keeps its state across a re-render); it does no
 * layout, events, or selectors. Returns a restore function.
 */
export function installFakeDom(): () => void {
    const scope = globalThis as Record<string, unknown>;
    const saved = Object.fromEntries(keys.map((key) => [key, scope[key]]));
    const document = new FakeDocument();
    scope.document = document;
    scope.window = scope;
    scope.IS_REACT_ACT_ENVIRONMENT = true;
    scope.HTMLElement = FakeElement;
    scope.HTMLIFrameElement = class {};
    return () => {
        for (const key of keys) {
            if (saved[key] === undefined) {
                delete scope[key];
            } else {
                scope[key] = saved[key];
            }
        }
    };
}

const keys = ['document', 'window', 'IS_REACT_ACT_ENVIRONMENT', 'HTMLElement', 'HTMLIFrameElement'];

class FakeNode {
    childNodes: FakeNode[] = [];
    parentNode: FakeNode | null = null;
    nodeValue: string | null = null;
    readonly nodeType: number;
    readonly nodeName: string;
    readonly ownerDocument: FakeDocument | null;

    constructor(nodeType: number, nodeName: string, ownerDocument: FakeDocument | null) {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.ownerDocument = ownerDocument;
    }

    get firstChild(): FakeNode | null {
        return this.childNodes[0] ?? null;
    }

    get lastChild(): FakeNode | null {
        return this.childNodes.at(-1) ?? null;
    }

    get nextSibling(): FakeNode | null {
        const siblings = this.parentNode?.childNodes ?? [];
        return siblings[siblings.indexOf(this) + 1] ?? null;
    }

    get textContent(): string {
        return this.nodeValue ?? this.childNodes.map((node) => node.textContent).join('');
    }

    set textContent(value: string) {
        for (const child of this.childNodes) {
            child.parentNode = null;
        }
        this.childNodes = [];
        if (value) {
            this.appendChild(new FakeNode(3, '#text', this.ownerDocument)).nodeValue = value;
        }
    }

    appendChild(node: FakeNode) {
        return this.insertBefore(node, null);
    }

    insertBefore(node: FakeNode, before: FakeNode | null) {
        node.parentNode?.removeChild(node);
        const at = before ? this.childNodes.indexOf(before) : -1;
        this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node);
        node.parentNode = this;
        return node;
    }

    removeChild(node: FakeNode) {
        this.childNodes = this.childNodes.filter((child) => child !== node);
        node.parentNode = null;
        return node;
    }

    addEventListener() {
        // No events: the tests drive React directly.
    }

    removeEventListener() {
        // No events.
    }
}

class FakeElement extends FakeNode {
    readonly attributes = new Map<string, string>();
    readonly style: Record<string, unknown> = {
        setProperty(this: Record<string, string>, name: string, value: string) {
            this[name] = value;
        },
        removeProperty(this: Record<string, string>, name: string) {
            delete this[name];
        },
    };
    readonly namespaceURI = 'http://www.w3.org/1999/xhtml';
    // Unsynced with `attributes`: components only write their own data flags here.
    readonly dataset: Record<string, string> = {};

    get tagName() {
        return this.nodeName;
    }

    setAttribute(name: string, value: string) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name: string) {
        return this.attributes.has(name);
    }

    removeAttribute(name: string) {
        this.attributes.delete(name);
    }
}

class FakeDocument extends FakeNode {
    readonly documentElement: FakeElement;
    readonly body: FakeElement;

    constructor() {
        super(9, '#document', null);
        this.documentElement = this.createElement('html');
        this.body = this.createElement('body');
        this.appendChild(this.documentElement).appendChild(this.body);
    }

    createElement(tag: string) {
        return new FakeElement(1, tag.toUpperCase(), this);
    }

    createElementNS(_namespace: string, tag: string) {
        return this.createElement(tag);
    }

    createTextNode(text: string) {
        const node = new FakeNode(3, '#text', this);
        node.nodeValue = text;
        return node;
    }
}
