// A JSON Schema (2020-12) validator for the keywords a vendored schema uses.
// It refuses schemas with keywords it does not implement, so a schema update
// that adds one fails loudly instead of validating less.

export interface JsonSchema {
    [keyword: string]: unknown;
}

// Keywords that never fail on their own; `then` is applied by `if`.
const passive = new Set(['$id', '$schema', 'default', 'description', 'examples', 'then', 'title']);

const validators: Record<string, (schema: JsonSchema, value: unknown, path: string) => string[]> = {
    additionalProperties: (schema, value, path) => {
        if (schema.additionalProperties !== false || !isObject(value)) {
            return [];
        }
        const known = Object.keys((schema.properties as JsonSchema | undefined) ?? {});
        return Object.keys(value)
            .filter((key) => !known.includes(key))
            .map((key) => `${path}/${key}: not allowed`);
    },
    allOf: (schema, value, path) =>
        (schema.allOf as JsonSchema[]).flatMap((sub) => jsonSchemaErrors(sub, value, path)),
    const: (schema, value, path) =>
        JSON.stringify(value) === JSON.stringify(schema.const) ? [] : [`${path}: not const`],
    contains: (schema, value, path) =>
        Array.isArray(value) &&
        !value.some((item) => jsonSchemaErrors(schema.contains as JsonSchema, item).length === 0)
            ? [`${path}: contains nothing matching`]
            : [],
    enum: (schema, value, path) =>
        (schema.enum as unknown[]).includes(value) ? [] : [`${path}: not in enum`],
    format: (schema, value, path) => {
        if (schema.format !== 'uri' || typeof value !== 'string') {
            return [];
        }
        return URL.canParse(value) ? [] : [`${path}: not a uri`];
    },
    if: (schema, value, path) =>
        jsonSchemaErrors(schema.if as JsonSchema, value).length === 0 && schema.then
            ? jsonSchemaErrors(schema.then as JsonSchema, value, path)
            : [],
    items: (schema, value, path) =>
        Array.isArray(value)
            ? value.flatMap((item, index) =>
                  jsonSchemaErrors(schema.items as JsonSchema, item, `${path}/${index}`)
              )
            : [],
    maxItems: (schema, value, path) =>
        Array.isArray(value) && value.length > (schema.maxItems as number)
            ? [`${path}: too many`]
            : [],
    maxLength: (schema, value, path) =>
        typeof value === 'string' && [...value].length > (schema.maxLength as number)
            ? [`${path}: too long`]
            : [],
    minItems: (schema, value, path) =>
        Array.isArray(value) && value.length < (schema.minItems as number)
            ? [`${path}: too few`]
            : [],
    minLength: (schema, value, path) =>
        typeof value === 'string' && [...value].length < (schema.minLength as number)
            ? [`${path}: too short`]
            : [],
    pattern: (schema, value, path) =>
        typeof value === 'string' && !new RegExp(schema.pattern as string, 'u').test(value)
            ? [`${path}: does not match ${schema.pattern}`]
            : [],
    properties: (schema, value, path) => {
        if (!isObject(value)) {
            return [];
        }
        return Object.entries(schema.properties as Record<string, JsonSchema>).flatMap(
            ([key, sub]) =>
                key in value ? jsonSchemaErrors(sub, value[key], `${path}/${key}`) : []
        );
    },
    required: (schema, value, path) =>
        isObject(value)
            ? (schema.required as string[])
                  .filter((key) => !(key in value))
                  .map((key) => `${path}/${key}: required`)
            : [],
    type: (schema, value, path) =>
        typeOf(value) === schema.type ? [] : [`${path}: not ${schema.type}`],
    uniqueItems: (schema, value, path) =>
        schema.uniqueItems === true &&
        Array.isArray(value) &&
        new Set(value.map((item) => JSON.stringify(item))).size !== value.length
            ? [`${path}: duplicate items`]
            : [],
};

/** Every violation of `schema` in `value`, as JSON-pointer-ish messages. */
export function jsonSchemaErrors(schema: JsonSchema, value: unknown, path = ''): string[] {
    return Object.keys(schema).flatMap((keyword) => {
        if (passive.has(keyword)) {
            return [];
        }
        const validate = validators[keyword];
        if (!validate) {
            throw new Error(`Unsupported JSON Schema keyword: ${keyword}`);
        }
        return validate(schema, value, path);
    });
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
    if (Array.isArray(value)) {
        return 'array';
    }
    if (value === null) {
        return 'null';
    }
    return typeof value;
}
