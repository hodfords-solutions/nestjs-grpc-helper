/**
 * Identifier conversions for generated Rust and Go code. They must match what the protoc plugins
 * emit, otherwise the wrapper references names that do not exist:
 * - prost / tonic use the `heck` crate (snake_case, UpperCamelCase);
 *   and prost-build's `sanitize_identifier` for keywords;
 * - protoc-gen-go uses `GoCamelCase` from google.golang.org/protobuf/internal/strs.
 */

// prost-build 0.13 `sanitize_identifier` (src/ident.rs): keywords that become raw identifiers.
const rustRawKeywords = new Set([
    // 2015 strict keywords
    'as',
    'break',
    'const',
    'continue',
    'else',
    'enum',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'static',
    'struct',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    // 2018 strict keywords
    'dyn',
    // 2015 reserved keywords
    'abstract',
    'become',
    'box',
    'do',
    'final',
    'macro',
    'override',
    'priv',
    'typeof',
    'unsized',
    'virtual',
    'yield',
    // 2018 reserved keywords
    'async',
    'await',
    'try'
]);
// Keywords that cannot be raw identifiers; prost-build suffixes them with `_`.
const rustSuffixedKeywords = new Set(['_', 'super', 'self', 'Self', 'extern', 'crate']);

// The 25 keywords of the Go specification.
const goKeywords = new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var'
]);

function isUpper(char: string): boolean {
    return char !== char.toLowerCase();
}

function isLower(char: string): boolean {
    return char !== char.toUpperCase();
}

export function splitWords(name: string): string[] {
    const words: string[] = [];
    const chars = [...name];
    let current = '';
    let mode: 'none' | 'lower' | 'upper' = 'none';

    chars.forEach((char, index) => {
        if (!/[\p{L}\p{N}]/u.test(char)) {
            if (current) {
                words.push(current);
            }
            current = '';
            mode = 'none';
            return;
        }

        const next = chars[index + 1];
        const nextIsLower = next !== undefined && isLower(next);
        const startsWord = isUpper(char) && (mode === 'lower' || (mode === 'upper' && nextIsLower));
        if (current && startsWord) {
            words.push(current);
            current = '';
        }

        current += char;
        if (isLower(char)) {
            mode = 'lower';
        } else if (isUpper(char)) {
            mode = 'upper';
        }
    });

    if (current) {
        words.push(current);
    }
    return words;
}

export function toSnakeCase(name: string): string {
    return splitWords(name)
        .map((word) => word.toLowerCase())
        .join('_');
}

export function toUpperCamelCase(name: string): string {
    return splitWords(name)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/** Same as prost-build's `sanitize_identifier`; apply it after the case conversion, as prost does. */
export function toRustIdentifier(name: string): string {
    if (rustRawKeywords.has(name)) {
        return `r#${name}`;
    }
    if (rustSuffixedKeywords.has(name)) {
        return `${name}_`;
    }
    if (/^\p{N}/u.test(name)) {
        return `_${name}`;
    }
    return name;
}

/**
 * Rust variant / Go constant suffix of an enum member. A name that does not start with a letter (for example
 * `'1st'`) gets a `V` prefix; a key without any letter or digit (for example `'>='`) gives an empty string.
 */
export function enumMemberName(key: string): string {
    const name = toUpperCamelCase(key);
    if (!name) {
        return '';
    }
    return /^\p{L}/u.test(name) ? name : `V${name}`;
}

function isAsciiLower(char: string | undefined): boolean {
    return char !== undefined && char >= 'a' && char <= 'z';
}

function isAsciiDigit(char: string): boolean {
    return char >= '0' && char <= '9';
}

/** Port of protoc-gen-go's `GoCamelCase` (google.golang.org/protobuf/internal/strs/strings.go). */
export function toGoCamelCase(name: string): string {
    let result = '';
    for (let index = 0; index < name.length; index++) {
        let char = name[index];
        const next = name[index + 1];
        if (char === '.' && isAsciiLower(next)) {
            // Skip over '.' in ".{{lowercase}}"
            continue;
        }
        if (char === '.') {
            result += '_';
        } else if (char === '_' && (index === 0 || name[index - 1] === '.')) {
            result += 'X';
        } else if (char === '_' && isAsciiLower(next)) {
            // Skip over '_' in "_{{lowercase}}"
            continue;
        } else if (isAsciiDigit(char)) {
            result += char;
        } else {
            // A new word: upper-case its first letter and copy the lowercase run that follows
            if (isAsciiLower(char)) {
                char = char.toUpperCase();
            }
            result += char;
            while (isAsciiLower(name[index + 1])) {
                result += name[index + 1];
                index++;
            }
        }
    }
    return result;
}

/**
 * The Go package name is the last module path segment with everything but letters, digits and `_`
 * removed, lower-cased. A major-version suffix (`/v2`) is skipped, as Go does, and a Go keyword gets
 * an `sdk` suffix.
 */
export function toGoPackageName(module: string): string {
    const segments = module.split('/');
    let lastSegment = segments.pop() ?? '';
    if (/^v[0-9]+$/.test(lastSegment) && segments.length) {
        lastSegment = segments.pop();
    }
    const packageName = lastSegment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
    if (!packageName || /^\d/.test(packageName)) {
        throw new Error(`Cannot derive a Go package name from module "${module}".`);
    }
    return goKeywords.has(packageName) ? `${packageName}sdk` : packageName;
}
