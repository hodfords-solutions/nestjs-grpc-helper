# Rust and Go SDK Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make-sdk` can build a Rust crate and a Go module (typed client wrappers over protoc-generated stubs) from the same `sdk-config.json` that builds the TypeScript SDK.

**Architecture:** A new `SdkDescriptorService` turns reflection metadata into a language-neutral model. `RustSdkGeneratorService` and `GoSdkGeneratorService` write `microservice.proto`, run `protoc` through `ProtocService`, and render Handlebars templates from that model. The TypeScript generator is not touched.

**Tech Stack:** TypeScript (ESM, NodeNext), Handlebars, vitest, `protoc` + `protoc-gen-prost` / `protoc-gen-tonic` / `protoc-gen-go` / `protoc-gen-go-grpc`, tonic 0.12 / prost 0.13, grpc-go.

**Spec:** `docs/superpowers/specs/2026-11-18-rust-go-sdk-design.md`

## Global Constraints

- **Do not run `git commit`, `git push`, or create branches.** The maintainer commits. Every task ends with a checkpoint (tests + lint), not a commit.
- Code style: Prettier with single quotes, 120 columns, 4-space indent, no trailing commas, semicolons. Relative imports end in `.js` (ESM NodeNext).
- `GenerateMicroserviceService` and every `lib/templates/*.hbs` file that exists today must not change. TypeScript SDK output stays byte-identical, except for the two `GenerateProtoService` / `@GrpcEnum` fixes in Task 2.
- New templates live only in `lib/templates/rust/` and `lib/templates/go/`.
- Pinned toolchain (single source: `lib/constants/sdk-toolchain.const.ts`): `protoc-gen-prost` 0.4.x, `protoc-gen-tonic` 0.4.x, `protoc-gen-go` 1.36.x, `protoc-gen-go-grpc` 1.5.x; crates `prost` 0.13, `tonic` 0.12; Go modules `google.golang.org/grpc` v1.71.0, `google.golang.org/protobuf` v1.36.6. Do not upgrade to tonic 0.14 — its generated code and codec crates differ and the templates here target 0.12.
- Generators never wipe an output directory; they remove only their owned paths (Task 4).
- Checkpoint commands: `pnpm test` and `pnpm run lint`. Both must pass before a task is reported done.
- New spec files that exceed the `max-lines-per-function` lint rule start with `/* eslint-disable max-lines-per-function */`, as the existing specs do.
- Deliberate departures from the spec text, each stricter or safer:
  - Rust streaming methods return a boxed `SdkStream<T>` (it implements `Stream<Item = Result<T, SdkError>>`) instead of `impl Stream`, so the stream is not tied to the client's lifetime.
  - The nullable-primitive warning is always logged for Rust/Go targets, because the limitation follows from the proto shape regardless of the Task 1 measurement.
  - `Cargo.toml` omits `tokio` and `serde`: the wrapper only needs `tokio-stream` and `serde_json`.
  - `ProtocService` runs `protoc` through the new `runBinary` (argument array, no shell) instead of `runCommand`, so paths with spaces are safe; and tools are checked before any owned path is removed.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/constants/sdk-toolchain.const.ts` (create) | Pinned tool and runtime versions, install hints |
| `lib/types/sdk-build-config.type.ts` (modify) | `rust` / `go` config blocks, `SdkLanguage` |
| `lib/types/sdk-descriptor.type.ts` (create) | Language-neutral descriptor types |
| `lib/helpers/shell.helper.ts` (modify) | `findBinary`, `runBinary`, `readBinaryVersion` |
| `lib/helpers/sdk-naming.helper.ts` (create) | Identifier conversion matching prost and protoc-gen-go |
| `lib/helpers/sdk-output.helper.ts` (create) | Output path validation, owned-path cleanup |
| `lib/services/sdk-descriptor.service.ts` (create) | Reflection → descriptor |
| `lib/services/protoc.service.ts` (create) | Tool checks, `protoc` invocation |
| `lib/services/go-sdk-generator.service.ts` (create) | Go module generation |
| `lib/services/rust-sdk-generator.service.ts` (create) | Rust crate generation |
| `lib/templates/go/*.hbs`, `lib/templates/rust/*.hbs` (create) | Wrapper templates |
| `lib/services/generate-proto.service.ts` (modify) | Reject `number` without `format` |
| `lib/decorators/grpc-param.decorator.ts` (modify) | Numeric enum defaults to `int32` |
| `lib/helpers/generate.helper.ts` (modify) | `generateSdk(config, languages?)` dispatch |
| `lib/commands/generate-sdk.command.ts` (modify) | `--lang` option |
| `tests/fixtures/sdk-fixture.microservice.ts` (create) | Shared fixture covering every response kind |
| `tests/sdk-integration.spec.ts` (create) | Real `protoc` + `cargo check` + `go build` |
| `.github/workflows/test.yml` (create) | PR test job with the toolchain |
| `README.md`, `cspell.json` (modify) | Docs, dictionary |

---

### Task 1: Toolchain, pinned versions, and wire checks

This task installs tools, creates the version constants, and answers three questions the later tasks depend on. It has two **stop gates**: if a gate fails, stop and report to the maintainer instead of continuing.

**Files:**
- Create: `lib/constants/sdk-toolchain.const.ts`

**Interfaces:**
- Produces: `SdkToolRequirement`, `PROTOC_TOOL`, `RUST_SDK_TOOLCHAIN`, `GO_SDK_TOOLCHAIN` (exact shapes below).

- [ ] **Step 1: Install dependencies and record the baseline**

Run: `pnpm install && pnpm test`
Expected: all existing tests pass. Record the number of passing tests.

- [ ] **Step 2: Install protoc and the four plugins**

```bash
brew install protobuf            # Debian/Ubuntu: sudo apt-get install -y protobuf-compiler libprotobuf-dev
cargo install protoc-gen-prost@0.4.0 --locked
cargo install protoc-gen-tonic@0.4.1 --locked
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
export PATH="$PATH:$(go env GOPATH)/bin:$HOME/.cargo/bin"
protoc --version
protoc-gen-go --version
protoc-gen-go-grpc --version
protoc-gen-prost --version < /dev/null
protoc-gen-tonic --version < /dev/null
```

Expected: `protoc` prints `libprotoc <version>`; `protoc-gen-go` prints `v1.36.6`; `protoc-gen-go-grpc` prints `1.5.1`. The two Rust plugins may or may not print a version (redirecting stdin stops them waiting for input) — record what they print. If a pinned version cannot be installed, stop and report; do not substitute another version.

- [ ] **Step 3: Create the toolchain constants**

Create `lib/constants/sdk-toolchain.const.ts`:

```ts
export type SdkToolRequirement = {
    binary: string;
    /** Required `major.minor`. Omitted when any version is acceptable. */
    version?: string;
    install: string;
};

export const PROTOC_TOOL: SdkToolRequirement = {
    binary: 'protoc',
    install: 'brew install protobuf  (Debian/Ubuntu: apt-get install -y protobuf-compiler libprotobuf-dev)'
};

export const RUST_SDK_TOOLCHAIN = {
    tools: [
        { binary: 'protoc-gen-prost', version: '0.4', install: 'cargo install protoc-gen-prost@0.4.0 --locked' },
        { binary: 'protoc-gen-tonic', version: '0.4', install: 'cargo install protoc-gen-tonic@0.4.1 --locked' }
    ] as SdkToolRequirement[],
    crates: {
        prost: '0.13',
        tonic: '0.12',
        tokioStream: '0.1',
        serdeJson: '1',
        thiserror: '1'
    }
};

export const GO_SDK_TOOLCHAIN = {
    tools: [
        {
            binary: 'protoc-gen-go',
            version: '1.36',
            install: 'go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6'
        },
        {
            binary: 'protoc-gen-go-grpc',
            version: '1.5',
            install: 'go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1'
        }
    ] as SdkToolRequirement[],
    goVersion: '1.23',
    modules: {
        grpc: 'v1.71.0',
        protobuf: 'v1.36.6'
    }
};
```

- [ ] **Step 4: GATE — compile the sample proto with protoc**

```bash
pnpm run build:sample-sdk        # writes proto/microservice.proto (gitignored), then exits
WORK=$(mktemp -d) && cp proto/microservice.proto "$WORK/" && mkdir -p "$WORK/go" "$WORK/rust"
( cd "$WORK" && protoc --proto_path=. \
    --go_out=go --go_opt=Mmicroservice.proto=example.com/sdk/pb --go_opt=module=example.com/sdk \
    --go-grpc_out=go --go-grpc_opt=Mmicroservice.proto=example.com/sdk/pb --go-grpc_opt=module=example.com/sdk \
    microservice.proto )
( cd "$WORK" && protoc --proto_path=. --prost_out=rust --tonic_out=rust microservice.proto )
find "$WORK" -type f | sort
grep -n 'include!' "$WORK"/rust/*.rs
```

Expected files: `go/pb/microservice.pb.go`, `go/pb/microservice_grpc.pb.go`, and two `.rs` files in `rust/`, one ending in `.tonic.rs`. Record the exact Rust file names and whether the non-tonic file contains `include!("….tonic.rs")` (Task 8 handles both cases at runtime).

**Stop gate:** if `protoc` rejects the sample proto, stop. Report the exact error to the maintainer; any fix belongs in `GenerateProtoService` and needs approval because it changes the TypeScript SDK's proto.

- [ ] **Step 5: GATE — confirm a `number` field is not loadable today**

```bash
printf 'syntax = "proto3";\npackage check;\nmessage Sample { number total = 1; }\n' > "$WORK/number.proto"
node -e "const l=require('@grpc/proto-loader'); try { l.loadSync(process.argv[1]); console.log('LOADABLE'); } catch (e) { console.log('NOT LOADABLE:', e.message); }" "$WORK/number.proto"
```

Expected: `NOT LOADABLE: …`.

**Stop gate:** if it prints `LOADABLE`, stop. Task 2 turns this case into a generation error on the assumption that no working project depends on it; that assumption would be false and the maintainer must decide.

- [ ] **Step 6: Measure the nullable-primitive response shape**

Create the temporary file `tests/tmp-nullable-primitive.spec.ts`:

```ts
import 'reflect-metadata';
import { describe, it } from 'vitest';
import { Metadata } from '@grpc/grpc-js';
import { ResponseInterceptor, ResponseModel } from '@hodfords/nestjs-response';

class Probe {
    @ResponseModel(String, false, true)
    maybeName(): any {
        return null;
    }
}

describe('nullable primitive probe', () => {
    it('prints what the interceptor hands to gRPC', () => {
        const interceptor = new ResponseInterceptor({ get: () => ({}) } as any);
        const context: any = {
            getHandler: () => Probe.prototype.maybeName,
            switchToRpc: () => ({ getContext: () => new Metadata() })
        };
        console.log('non-null:', JSON.stringify((interceptor as any).handleResponse(context, 'abc')));
        console.log('null:', JSON.stringify((interceptor as any).handleResponse(context, null)));
    });
});
```

Run: `pnpm vitest run tests/tmp-nullable-primitive.spec.ts`
Then delete the file: `rm tests/tmp-nullable-primitive.spec.ts`

Record both printed lines. The proto declares this response as `NativeStringValue { bool grpcNative; string value; }`. If the `non-null` line shows `value` as an object (`{"value":{"value":"abc","grpcNative":true},"grpcNullable":true}`), the server-side issue described in the spec is confirmed.

- [ ] **Step 7: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: same pass count as Step 1. Do not commit.

Report to the maintainer: installed versions, the Rust generated file names, whether the prost file includes the tonic file, the Step 5 result, and both lines from Step 6 (so the maintainer can open the separate nullable-primitive issue).

---

### Task 2: Proto strictness — `number` needs a format, numeric enums default to `int32`

**Files:**
- Modify: `lib/services/generate-proto.service.ts` (`generateModel`, `getProtoType`)
- Modify: `lib/decorators/grpc-param.decorator.ts` (`GrpcEnum`, `GrpcEnums`)
- Test: `lib/services/generate-proto.service.spec.ts`, `lib/decorators/grpc-param.decorator.spec.ts`

**Interfaces:**
- Produces: `GenerateProtoService.getProtoType(option: PropertyOptionType, owner?: string): string` — throws when `option.type === 'number'` and `option.format` is nil.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe('GenerateProtoService', …)` in `lib/services/generate-proto.service.spec.ts`:

```ts
    describe('number properties without a format', () => {
        it('should fail with the class and property name', () => {
            const service = new GenerateProtoService('pkg', os.tmpdir());

            expect(() =>
                service.generateModel({ name: 'OrderDto' } as any, [{ name: 'amount', option: { type: 'number' } }])
            ).toThrow('OrderDto.amount has type "number" without a "format"');
        });

        it('should keep emitting the format when one is given', () => {
            const service = new GenerateProtoService('pkg', os.tmpdir());

            const content = service.generateModel({ name: 'OrderDto' } as any, [
                { name: 'amount', option: { type: 'number', format: 'double' } }
            ]);

            expect(content).toContain('double amount = 1;');
        });
    });
```

Append to the `describe('GrpcEnum', …)` block in `lib/decorators/grpc-param.decorator.spec.ts`:

```ts
    it('defaults numeric enums to format "int32" so the proto type is valid', () => {
        class Service {
            getByLevel(@GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum' }) level: number): void {
                void level;
            }
        }

        const [param] = getParams(Service.prototype, 'getByLevel');
        expect(param.format).toBe('int32');
    });

    it('keeps an explicit format on numeric enums', () => {
        class Service {
            getByLevel(
                @GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum', format: 'int64' }) level: number
            ): void {
                void level;
            }
        }

        const [param] = getParams(Service.prototype, 'getByLevel');
        expect(param.format).toBe('int64');
    });

    it('does not add a format to string enums', () => {
        class Service {
            getByType(@GrpcEnum({ name: 'userType', enum: StringEnum, enumName: 'StringEnum' }) userType: string): void {
                void userType;
            }
        }

        const [param] = getParams(Service.prototype, 'getByType');
        expect(param.format).toBeUndefined();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/services/generate-proto.service.spec.ts lib/decorators/grpc-param.decorator.spec.ts`
Expected: FAIL — the first new test gets `number amount = 1;` instead of a throw; the `int32` test gets `undefined`.

- [ ] **Step 3: Implement**

In `lib/services/generate-proto.service.ts`, change `generateModel` to pass the owner, and `getProtoType` to reject the missing format:

```ts
    generateModel(dto: Function, properties): string {
        const propertyContent = properties
            .map(
                (property, index) =>
                    `${property.option.isArray ? 'repeated ' : ''}${this.getProtoType(
                        property.option,
                        `${dto.name}.${property.name}`
                    )} ${property.name} = ${index + 1};`
            )
            .join('\n\t');

        return this.compileTemplate('service-interface.hbs', {
            propertyContent,
            name: dto.name
        });
    }
```

```ts
    getProtoType(option: PropertyOptionType, owner?: string): string {
        const { type, format } = option;

        if (isFunction(type)) {
            if (type.name === 'type') {
                return (type as any)().name;
            }
            return type.name;
        }

        if (format === 'any') {
            return 'string';
        }

        if (type === 'number') {
            if (isNil(format)) {
                throw new Error(
                    `${owner ?? 'Property'} has type "number" without a "format". ` +
                        `Protobuf has no "number" type; set format to 'int32', 'int64', 'float' or 'double'.`
                );
            }
            return format;
        }

        if (type === 'boolean') {
            return 'bool';
        }

        return type;
    }
```

In `lib/decorators/grpc-param.decorator.ts`, add a helper under `getEnumType` and use it in both decorators:

```ts
function resolveEnumOptions(option: EnumParamOptionType): EnumParamOptionType & { type: string } {
    const type = getEnumType(option.enum);
    // Protobuf has no "number" type; numeric TypeScript enums are integers.
    const format = type === 'number' && !option.format ? { format: 'int32' } : {};
    return { type, ...format, ...option };
}

export function GrpcEnum(option: EnumParamOptionType): ParameterDecorator {
    return GrpcParam({
        ...resolveEnumOptions(option),
        required: true,
        decorators: [IsNotEmpty(), IsEnum(option.enum)]
    });
}

export function GrpcEnums(option: EnumParamOptionType): ParameterDecorator {
    return GrpcParam({
        ...resolveEnumOptions(option),
        required: true,
        isArray: true,
        decorators: [IsArray(), IsEnum(option.enum, { each: true })]
    });
}
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS. If another spec generates a proto from a fixture that declares `type: Number` without `format`, add `format: 'int32'` to that fixture property — do not weaken the new check.

- [ ] **Step 5: Checkpoint**

Run: `pnpm run lint`
Expected: no errors. Do not commit.

---

### Task 3: Config types, shell helpers, naming helpers

**Files:**
- Modify: `lib/types/sdk-build-config.type.ts`
- Modify: `lib/helpers/shell.helper.ts`
- Create: `lib/helpers/sdk-naming.helper.ts`
- Test: `lib/helpers/shell.helper.spec.ts` (create), `lib/helpers/sdk-naming.helper.spec.ts` (create)

**Interfaces:**
- Produces:
  - `type SdkLanguage = 'ts' | 'rust' | 'go'`
  - `type RustSdkConfigType = { crateName: string; version?: string; output: string; build?: boolean }`
  - `type GoSdkConfigType = { module: string; output: string; build?: boolean }`
  - `SdkBuildConfigType.rust?: RustSdkConfigType`, `SdkBuildConfigType.go?: GoSdkConfigType`
  - `findBinary(binary: string): string | null`
  - `runBinary(binary: string, args: string[], cwd?: string): string` — returns stdout, throws on spawn error or non-zero exit
  - `readBinaryVersion(binary: string): string | null` — first `major.minor[.patch]` in `--version` output
  - `splitWords(name: string): string[]`, `toSnakeCase(name: string): string`, `toUpperCamelCase(name: string): string`, `toGoCamelCase(name: string): string`, `toGoPackageName(module: string): string`

- [ ] **Step 1: Add the config types**

Replace the content of `lib/types/sdk-build-config.type.ts`:

```ts
export type SdkLanguage = 'ts' | 'rust' | 'go';

export type RustSdkConfigType = {
    crateName: string;
    version?: string;
    output: string;
    build?: boolean;
};

export type GoSdkConfigType = {
    module: string;
    output: string;
    build?: boolean;
};

export type SdkBuildConfigType = {
    name: string;
    packageName: string;
    aiSkill?: {
        name: string;
        description: string;
    };
    format?: boolean;
    formatter?: 'prettier' | 'oxfmt';
    build?: boolean;
    addAllowDecorator?: boolean;
    output: string;
    outputBuild?: string;
    removeOutput?: boolean;
    tsconfig?: any;
    rust?: RustSdkConfigType;
    go?: GoSdkConfigType;
};
```

- [ ] **Step 2: Write the failing tests**

Create `lib/helpers/shell.helper.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findBinary, readBinaryVersion, runBinary } from './shell.helper.js';

describe('shell.helper', () => {
    it('finds a binary that is on PATH', () => {
        expect(findBinary('node')).toEqual(expect.any(String));
    });

    it('returns null for a binary that is not on PATH', () => {
        expect(findBinary('definitely-not-a-real-binary-xyz')).toBeNull();
    });

    it('returns stdout of a successful command', () => {
        expect(runBinary(process.execPath, ['-e', 'console.log("ok")'])).toBe('ok\n');
    });

    it('throws with stderr when the command exits non-zero', () => {
        expect(() => runBinary(process.execPath, ['-e', 'console.error("boom"); process.exit(2)'])).toThrow('boom');
    });

    it('throws when the binary cannot be started', () => {
        expect(() => runBinary('definitely-not-a-real-binary-xyz', [])).toThrow(
            'Unable to run definitely-not-a-real-binary-xyz'
        );
    });

    it('reads the first version number from --version output', () => {
        expect(readBinaryVersion(process.execPath)).toBe(process.versions.node);
    });

    it('returns null when the binary is missing', () => {
        expect(readBinaryVersion('definitely-not-a-real-binary-xyz')).toBeNull();
    });
});
```

Create `lib/helpers/sdk-naming.helper.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitWords, toGoCamelCase, toGoPackageName, toSnakeCase, toUpperCamelCase } from './sdk-naming.helper.js';

describe('sdk-naming.helper', () => {
    it('splits on case boundaries the way prost (heck) does', () => {
        expect(splitWords('findMany')).toEqual(['find', 'Many']);
        expect(splitWords('parseXMLDocument')).toEqual(['parse', 'XML', 'Document']);
        expect(splitWords('getV2User')).toEqual(['get', 'V2', 'User']);
        expect(splitWords('SUPER_ADMIN')).toEqual(['SUPER', 'ADMIN']);
    });

    it('converts rpc and service names to snake_case', () => {
        expect(toSnakeCase('findMany')).toBe('find_many');
        expect(toSnakeCase('getV2User')).toBe('get_v2_user');
        expect(toSnakeCase('AppMicroservice')).toBe('app_microservice');
    });

    it('converts message and variant names to UpperCamelCase', () => {
        expect(toUpperCamelCase('ProtoUserResponseList')).toBe('ProtoUserResponseList');
        expect(toUpperCamelCase('UserDTO')).toBe('UserDto');
        expect(toUpperCamelCase('SUPER_ADMIN')).toBe('SuperAdmin');
        expect(toUpperCamelCase('active')).toBe('Active');
    });

    it('converts names the way protoc-gen-go does', () => {
        expect(toGoCamelCase('findMany')).toBe('FindMany');
        expect(toGoCamelCase('UserDTO')).toBe('UserDTO');
        expect(toGoCamelCase('user_name')).toBe('UserName');
    });

    it('derives a Go package name from the module path', () => {
        expect(toGoPackageName('github.com/org/sdk-name-go')).toBe('sdknamego');
        expect(toGoPackageName('example.com/Billing_SDK')).toBe('billing_sdk');
    });

    it('rejects a module path without a usable last segment', () => {
        expect(() => toGoPackageName('example.com/---')).toThrow('Cannot derive a Go package name');
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run lib/helpers/shell.helper.spec.ts lib/helpers/sdk-naming.helper.spec.ts`
Expected: FAIL — `findBinary` is not exported; `sdk-naming.helper.js` does not exist.

- [ ] **Step 4: Implement**

Replace the content of `lib/helpers/shell.helper.ts`:

```ts
import { spawnSync } from 'node:child_process';
import shelljs from 'shelljs';

const { exec } = shelljs;

export function runCommand(command: string, cwd: string = process.cwd()): any {
    const result = exec(command, { silent: true, cwd: cwd });
    if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result;
}

export function findBinary(binary: string): string | null {
    const found = shelljs.which(binary);
    return found ? found.toString() : null;
}

/**
 * Runs a binary with an argument array (no shell, so paths with spaces are safe) and returns stdout.
 * stdin is closed immediately: protoc plugins read a request from stdin and would otherwise hang.
 */
export function runBinary(binary: string, args: string[], cwd: string = process.cwd()): string {
    const result = spawnSync(binary, args, { cwd, encoding: 'utf8', input: '' });
    if (result.error) {
        throw new Error(`Unable to run ${binary}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${binary} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }
    return result.stdout;
}

export function readBinaryVersion(binary: string): string | null {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8', input: '', timeout: 5000 });
    if (result.error) {
        return null;
    }
    const match = /\d+\.\d+(?:\.\d+)?/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    return match ? match[0] : null;
}
```

Create `lib/helpers/sdk-naming.helper.ts`:

```ts
/**
 * Identifier conversions for generated Rust and Go code. They must match what the protoc plugins
 * emit, otherwise the wrapper references names that do not exist:
 * - prost / tonic use the `heck` crate (snake_case, UpperCamelCase);
 * - protoc-gen-go keeps the original casing and only upper-cases the first letter and letters after `_`.
 */

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

export function toGoCamelCase(name: string): string {
    const joined = name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function toGoPackageName(module: string): string {
    const lastSegment = module.split('/').pop() ?? '';
    const packageName = lastSegment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
    if (!packageName || /^\d/.test(packageName)) {
        throw new Error(`Cannot derive a Go package name from module "${module}".`);
    }
    return packageName;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run lib/helpers/shell.helper.spec.ts lib/helpers/sdk-naming.helper.spec.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 4: Output directory safety

**Files:**
- Create: `lib/helpers/sdk-output.helper.ts`
- Test: `lib/helpers/sdk-output.helper.spec.ts`

**Interfaces:**
- Consumes: `SdkBuildConfigType`, `SdkLanguage` (Task 3).
- Produces:
  - `RUST_OWNED_PATHS: string[]`, `GO_OWNED_PATHS: string[]`
  - `assertSdkOutputs(config: SdkBuildConfigType, languages: SdkLanguage[], cwd?: string): void`
  - `cleanOwnedPaths(outputDir: string, ownedPaths: string[]): void`

- [ ] **Step 1: Write the failing tests**

Create `lib/helpers/sdk-output.helper.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { assertSdkOutputs, cleanOwnedPaths, GO_OWNED_PATHS } from './sdk-output.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';

const baseConfig: SdkBuildConfigType = {
    name: 'sdkName',
    packageName: '@scope/sdk',
    output: 'sdk',
    outputBuild: 'sdkBuild'
};

describe('assertSdkOutputs', () => {
    const cwd = '/work/app';

    it('accepts separate directories, including ones outside the working directory', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'sdk-rust' },
            go: { module: 'example.com/sdk', output: '../sdk-go' }
        };

        expect(() => assertSdkOutputs(config, ['ts', 'rust', 'go'], cwd)).not.toThrow();
    });

    it('rejects an output that is the working directory', () => {
        const config = { ...baseConfig, go: { module: 'example.com/sdk', output: '.' } };

        expect(() => assertSdkOutputs(config, ['go'], cwd)).toThrow('"go.output" must not be the working directory');
    });

    it('rejects an output shared with the TypeScript output', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: './sdk' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow('"rust.output" is also used by "output"');
    });

    it('rejects an output shared with the TypeScript build output', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: 'sdkBuild' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow('"rust.output" is also used by "outputBuild"');
    });

    it('rejects rust and go sharing a directory', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'native' },
            go: { module: 'example.com/sdk', output: 'native' }
        };

        expect(() => assertSdkOutputs(config, ['rust', 'go'], cwd)).toThrow('"go.output" is also used by "rust.output"');
    });

    it('rejects a requested language without a config block', () => {
        expect(() => assertSdkOutputs(baseConfig, ['rust'], cwd)).toThrow(
            'Language "rust" was requested but the SDK config has no "rust" block'
        );
    });

    it('ignores blocks for languages that are not being built', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: '.' } };

        expect(() => assertSdkOutputs(config, ['ts'], cwd)).not.toThrow();
    });
});

describe('cleanOwnedPaths', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-output-'));
    });

    afterEach(() => {
        fs.removeSync(dir);
    });

    it('removes owned paths and keeps everything else', () => {
        fs.outputFileSync(path.join(dir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(dir, 'go.sum'), 'sum');
        fs.outputFileSync(path.join(dir, 'README.md'), 'readme');
        fs.outputFileSync(path.join(dir, 'pb/old.pb.go'), 'old');
        fs.outputFileSync(path.join(dir, 'client.go'), 'old');

        cleanOwnedPaths(dir, GO_OWNED_PATHS);

        expect(fs.existsSync(path.join(dir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'go.sum'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'pb'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'client.go'))).toBe(false);
    });

    it('creates the output directory when it does not exist', () => {
        const target = path.join(dir, 'nested/sdk-go');

        cleanOwnedPaths(target, GO_OWNED_PATHS);

        expect(fs.existsSync(target)).toBe(true);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/helpers/sdk-output.helper.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/helpers/sdk-output.helper.ts`:

```ts
import fs from 'fs-extra';
import path from 'node:path';
import { SdkBuildConfigType, SdkLanguage } from '../types/sdk-build-config.type.js';

/** Paths a generator may delete and rewrite. Everything else in the output directory is left alone. */
export const RUST_OWNED_PATHS = ['Cargo.toml', 'microservice.proto', 'src'];
export const GO_OWNED_PATHS = ['go.mod', 'microservice.proto', 'pb', 'client.go', 'errors.go', 'enums.go'];

/**
 * Rust and Go outputs are usually their own git repositories. Fail before anything is written when
 * an output could clobber the application or another SDK.
 */
export function assertSdkOutputs(
    config: SdkBuildConfigType,
    languages: SdkLanguage[],
    cwd: string = process.cwd()
): void {
    const claimed = new Map<string, string>();
    for (const key of ['output', 'outputBuild'] as const) {
        if (config[key]) {
            claimed.set(path.resolve(cwd, config[key]), key);
        }
    }

    for (const language of ['rust', 'go'] as const) {
        if (!languages.includes(language)) {
            continue;
        }

        const block = config[language];
        if (!block) {
            throw new Error(`Language "${language}" was requested but the SDK config has no "${language}" block.`);
        }

        const label = `${language}.output`;
        if (!block.output) {
            throw new Error(`"${label}" is required in the SDK config.`);
        }

        const resolved = path.resolve(cwd, block.output);
        if (resolved === path.resolve(cwd)) {
            throw new Error(`"${label}" must not be the working directory.`);
        }

        const owner = claimed.get(resolved);
        if (owner) {
            throw new Error(`"${label}" is also used by "${owner}". Each SDK needs its own directory.`);
        }
        claimed.set(resolved, label);
    }
}

export function cleanOwnedPaths(outputDir: string, ownedPaths: string[]): void {
    fs.ensureDirSync(outputDir);
    for (const ownedPath of ownedPaths) {
        fs.removeSync(path.join(outputDir, ownedPath));
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/helpers/sdk-output.helper.spec.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 5: Shared fixture and `SdkDescriptorService`

**Files:**
- Create: `lib/types/sdk-descriptor.type.ts`
- Create: `tests/fixtures/sdk-fixture.microservice.ts`
- Create: `lib/services/sdk-descriptor.service.ts`
- Test: `lib/services/sdk-descriptor.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`@GrpcEnum` numeric default, so the fixture's numeric enum yields a valid proto).
- Produces:

```ts
export type SdkNativeType = 'string' | 'bool' | 'float';
export type SdkResponseKind = 'empty' | 'single' | 'list' | 'native' | 'nativeList' | 'nullable';
export type SdkMethodDescriptor = {
    name: string;
    description?: string;
    requestType?: string;
    responseKind: SdkResponseKind;
    responseType?: string;
    wireResponseType: string;
    isStream: boolean;
    metadataKeys: string[];
    isNullablePrimitive: boolean;
};
export type SdkServiceDescriptor = { name: string; description?: string; methods: SdkMethodDescriptor[] };
export type SdkEnumDescriptor = {
    name: string;
    valueType: 'string' | 'number';
    entries: { key: string; value: string | number }[];
};
export type SdkDescriptor = { packageName: string; services: SdkServiceDescriptor[]; enums: SdkEnumDescriptor[] };
```

  - `new SdkDescriptorService(packageName: string).describe(): SdkDescriptor`
  - Fixture exports: `SdkFixtureMicroservice`, `FixtureStatusEnum`, `FixtureLevelEnum`, `FixtureItemResponse`, `FixtureQueryDto`.

`isNullablePrimitive` is an addition to the spec's type: it marks a primitive response declared with `isAllowEmpty`, which Task 9 warns about.

- [ ] **Step 1: Create the descriptor types**

Create `lib/types/sdk-descriptor.type.ts` with exactly the type block shown under **Interfaces** above.

- [ ] **Step 2: Create the shared fixture**

Create `tests/fixtures/sdk-fixture.microservice.ts`:

```ts
import 'reflect-metadata';
// Register the Native*Value response classes exactly like importing the library index does in production
import '../../lib/responses/native.response.js';
import { ResponseModel } from '@hodfords/nestjs-response';
import { GrpcMetadataId } from '../../lib/decorators/grpc-metadata.decorator.js';
import { GrpcEnum, GrpcId } from '../../lib/decorators/grpc-param.decorator.js';
import { GrpcValue } from '../../lib/decorators/grpc-value.decorator.js';
import {
    GrpcAction,
    GrpcStreamAction,
    RegisterGrpcMicroservice
} from '../../lib/decorators/microservice.decorator.js';
import { Property } from '../../lib/decorators/property.decorator.js';

export enum FixtureStatusEnum {
    ACTIVE = 'active',
    SUPER_ADMIN = 'super_admin'
}

export enum FixtureLevelEnum {
    LOW = 1,
    HIGH = 2
}

export class FixtureItemResponse {
    @Property({ type: String })
    id: string;

    @Property({ type: String, enum: FixtureStatusEnum, enumName: 'FixtureStatusEnum', required: false })
    status?: FixtureStatusEnum;

    @Property({ type: Number, format: 'int32' })
    total: number;

    @Property({ type: 'string', format: 'any' })
    data: any;
}

export class FixtureQueryDto {
    @Property({ type: String, description: 'Search keyword' })
    keyword: string;

    @Property({ type: String, isArray: true })
    tags: string[];
}

@RegisterGrpcMicroservice('Fixture service covering every response kind')
export class SdkFixtureMicroservice {
    @GrpcAction('Find one item')
    @ResponseModel(FixtureItemResponse)
    findOne(@GrpcValue() query: FixtureQueryDto): any {
        return query;
    }

    @GrpcAction('Find many items')
    @ResponseModel(FixtureItemResponse, true)
    findMany(@GrpcValue() query: FixtureQueryDto): any {
        return [query];
    }

    @GrpcAction('Get the item name')
    @ResponseModel(String)
    getName(@GrpcValue() query: FixtureQueryDto): any {
        return query.keyword;
    }

    @GrpcAction('Count items')
    @ResponseModel(Number)
    countItems(@GrpcValue() query: FixtureQueryDto): any {
        return query.tags.length;
    }

    @GrpcAction('Check whether an item is active')
    @ResponseModel(Boolean)
    isActive(@GrpcValue() query: FixtureQueryDto): any {
        return Boolean(query);
    }

    @GrpcAction('List item tags')
    @ResponseModel(String, true)
    getTags(@GrpcValue() query: FixtureQueryDto): any {
        return query.tags;
    }

    @GrpcAction('Find one item or nothing')
    @ResponseModel(FixtureItemResponse, { isAllowEmpty: true })
    maybeFindOne(@GrpcValue() query: FixtureQueryDto): any {
        return query;
    }

    @GrpcAction('Get the item name or nothing')
    @ResponseModel(String, false, true)
    maybeGetName(@GrpcValue() query: FixtureQueryDto): any {
        return query.keyword;
    }

    @GrpcAction('No parameters and no response')
    ping(): void {}

    @GrpcStreamAction('Watch items as they change')
    @ResponseModel(FixtureItemResponse)
    watchItems(@GrpcValue() query: FixtureQueryDto): any {
        return query;
    }

    @GrpcAction('Get an item by level')
    @ResponseModel(String)
    getByLevel(
        @GrpcId('itemId') itemId: string,
        @GrpcEnum({ name: 'level', enum: FixtureLevelEnum, enumName: 'FixtureLevelEnum' }) level: FixtureLevelEnum
    ): any {
        return `${itemId}-${level}`;
    }

    @GrpcAction('Get the workspace of the caller')
    @ResponseModel(String)
    getWorkspace(@GrpcMetadataId('workspace-id') workspaceId: string): any {
        return workspaceId;
    }
}
```

- [ ] **Step 3: Write the failing tests**

Create `lib/services/sdk-descriptor.service.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkDescriptor, SdkMethodDescriptor } from '../types/sdk-descriptor.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { SdkDescriptorService } from './sdk-descriptor.service.js';

describe('SdkDescriptorService', () => {
    let descriptor: SdkDescriptor;
    const method = (name: string): SdkMethodDescriptor =>
        descriptor.services[0].methods.find((candidate) => candidate.name === name);

    beforeAll(() => {
        descriptor = new SdkDescriptorService('fixturePkg').describe();
    });

    it('describes the registered service', () => {
        expect(descriptor.packageName).toBe('fixturePkg');
        expect(descriptor.services).toHaveLength(1);
        expect(descriptor.services[0].name).toBe('SdkFixtureMicroservice');
        expect(descriptor.services[0].description).toBe('Fixture service covering every response kind');
    });

    it('classifies a single model response', () => {
        expect(method('findOne')).toEqual({
            name: 'findOne',
            description: 'Find one item',
            requestType: 'FixtureQueryDto',
            responseKind: 'single',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'FixtureItemResponse',
            isStream: false,
            metadataKeys: [],
            isNullablePrimitive: false
        });
    });

    it('classifies a list of models', () => {
        expect(method('findMany')).toMatchObject({
            responseKind: 'list',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'ProtoFixtureItemResponseList'
        });
    });

    it('classifies native responses', () => {
        expect(method('getName')).toMatchObject({
            responseKind: 'native',
            responseType: 'string',
            wireResponseType: 'NativeStringValue'
        });
        expect(method('countItems')).toMatchObject({
            responseKind: 'native',
            responseType: 'float',
            wireResponseType: 'NativeNumberValue'
        });
        expect(method('isActive')).toMatchObject({
            responseKind: 'native',
            responseType: 'bool',
            wireResponseType: 'NativeBooleanValue'
        });
    });

    it('classifies a list of natives', () => {
        expect(method('getTags')).toMatchObject({
            responseKind: 'nativeList',
            responseType: 'string',
            wireResponseType: 'ProtoStringList'
        });
    });

    it('classifies a nullable model', () => {
        expect(method('maybeFindOne')).toMatchObject({
            responseKind: 'nullable',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'NullableGrpcClassResponseOfFixtureItemResponse',
            isNullablePrimitive: false
        });
    });

    it('treats a nullable primitive as native, because the proto emits Native*Value for it', () => {
        expect(method('maybeGetName')).toMatchObject({
            responseKind: 'native',
            responseType: 'string',
            wireResponseType: 'NativeStringValue',
            isNullablePrimitive: true
        });
    });

    it('describes a method without request or response', () => {
        expect(method('ping')).toMatchObject({
            requestType: undefined,
            responseKind: 'empty',
            responseType: undefined,
            wireResponseType: 'google.protobuf.Empty'
        });
    });

    it('flags streaming methods and keeps their response kind', () => {
        expect(method('watchItems')).toMatchObject({ isStream: true, responseKind: 'single' });
        expect(method('findOne').isStream).toBe(false);
    });

    it('uses the auto-generated request message for direct parameters', () => {
        expect(method('getByLevel').requestType).toBe('SdkFixtureMicroserviceGetByLevelParams');
    });

    it('lists metadata keys read by the server', () => {
        expect(method('getWorkspace')).toMatchObject({ requestType: undefined, metadataKeys: ['workspace-id'] });
    });

    it('describes string and numeric enums', () => {
        expect(descriptor.enums).toEqual(
            expect.arrayContaining([
                {
                    name: 'FixtureStatusEnum',
                    valueType: 'string',
                    entries: [
                        { key: 'ACTIVE', value: 'active' },
                        { key: 'SUPER_ADMIN', value: 'super_admin' }
                    ]
                },
                {
                    name: 'FixtureLevelEnum',
                    valueType: 'number',
                    entries: [
                        { key: 'LOW', value: 1 },
                        { key: 'HIGH', value: 2 }
                    ]
                }
            ])
        );
        expect(descriptor.enums).toHaveLength(2);
    });

    describe('agreement with the generated proto', () => {
        let tempDir: string;
        const rpcs = new Map<string, { request: string; response: string; isStream: boolean }>();

        beforeAll(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-descriptor-'));
            new GenerateProtoService('fixturePkg', tempDir).generate();
            const proto = fs.readFileSync(path.join(tempDir, 'microservice.proto'), 'utf8');

            for (const [, serviceName, body] of proto.matchAll(/service (\w+) \{([\s\S]*?)\n\}/g)) {
                for (const [, rpc, request, stream, response] of body.matchAll(
                    /rpc (\w+) \(([\w.]+)\) returns \((stream )?([\w.]+)\) \{\}/g
                )) {
                    rpcs.set(`${serviceName}.${rpc}`, { request, response, isStream: Boolean(stream) });
                }
            }
        });

        afterAll(() => {
            fs.removeSync(tempDir);
        });

        it('matches every rpc request and response message in microservice.proto', () => {
            const described = new Map<string, { request: string; response: string; isStream: boolean }>();
            for (const service of descriptor.services) {
                for (const item of service.methods) {
                    described.set(`${service.name}.${item.name}`, {
                        request: item.requestType ?? 'google.protobuf.Empty',
                        response: item.wireResponseType,
                        isStream: item.isStream
                    });
                }
            }

            expect(rpcs.size).toBeGreaterThan(0);
            expect(Object.fromEntries(described)).toEqual(Object.fromEntries(rpcs));
        });
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run lib/services/sdk-descriptor.service.spec.ts`
Expected: FAIL — `sdk-descriptor.service.js` not found.

- [ ] **Step 5: Implement**

Create `lib/services/sdk-descriptor.service.ts`:

```ts
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { NullableGrpcClassResponseNamePrefix, RESPONSE_METADATA_KEY, ResponseMetadata } from '@hodfords/nestjs-response';
import { isUndefined } from '@nestjs/common/utils/shared.utils.js';
import {
    GRPC_DESCRIPTION_METADATA_KEY,
    GRPC_METADATA_PARAMETERS_METADATA_KEY,
    GRPC_METHOD_METADATA_KEY,
    GRPC_PARAM_INDEX_METADATA_KEY,
    GRPC_STREAM_METADATA_KEY
} from '../constants/metadata-key.const.js';
import { isEnumProperty } from '../helpers/api-property.helper.js';
import { extractProperties } from '../helpers/property.helper.js';
import { isPrimitiveType } from '../helpers/type.helper.js';
import { microserviceStorage } from '../storages/microservice.storage.js';
import { MetadataParameterOptionType } from '../types/metadata-parameter-option.type.js';
import {
    SdkDescriptor,
    SdkEnumDescriptor,
    SdkMethodDescriptor,
    SdkNativeType,
    SdkServiceDescriptor
} from '../types/sdk-descriptor.type.js';

const EMPTY_MESSAGE = 'google.protobuf.Empty';

// Mirrors GenerateProtoService.generateNativeModelList / NativeNumberValue: Number travels as `float`.
const NATIVE_TYPES: Record<string, SdkNativeType> = {
    String: 'string',
    Boolean: 'bool',
    Number: 'float'
};

type ResponseDescription = Pick<
    SdkMethodDescriptor,
    'responseKind' | 'responseType' | 'wireResponseType' | 'isNullablePrimitive'
>;

/**
 * Turns the registered microservices into a language-neutral model for the Rust and Go generators.
 * The response classification repeats GenerateProtoService.generateRpcMethod, including its branch
 * order; sdk-descriptor.service.spec.ts compares both against the generated proto.
 */
export class SdkDescriptorService {
    constructor(private packageName: string) {}

    describe(): SdkDescriptor {
        return {
            packageName: this.packageName,
            services: microserviceStorage
                .map((constructor) => this.describeService(constructor))
                .filter((service) => service.methods.length > 0),
            enums: this.describeEnums()
        };
    }

    private describeService(constructor: Function): SdkServiceDescriptor {
        const methods = Object.getOwnPropertyNames(constructor.prototype)
            .filter((propertyKey) => Reflect.hasMetadata(GRPC_METHOD_METADATA_KEY, constructor.prototype, propertyKey))
            .map((propertyKey) => this.describeMethod(constructor, propertyKey));

        return {
            name: constructor.name,
            description: Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, constructor),
            methods
        };
    }

    private describeMethod(constructor: Function, propertyKey: string): SdkMethodDescriptor {
        const prototype = constructor.prototype;
        const params = Reflect.getMetadata('design:paramtypes', prototype, propertyKey);
        const parameterIndex = Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, prototype, propertyKey);
        const response: ResponseMetadata = Reflect.getMetadata(RESPONSE_METADATA_KEY, prototype[propertyKey]);
        const metadataParams: MetadataParameterOptionType[] =
            Reflect.getMetadata(GRPC_METADATA_PARAMETERS_METADATA_KEY, prototype, propertyKey) || [];

        return {
            name: propertyKey,
            description: Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, prototype, propertyKey),
            requestType: isUndefined(parameterIndex) ? undefined : params[parameterIndex].name,
            ...this.describeResponse(response),
            isStream: Boolean(Reflect.getMetadata(GRPC_STREAM_METADATA_KEY, prototype, propertyKey)),
            metadataKeys: metadataParams.map((param) => param.name)
        };
    }

    private describeResponse(response: ResponseMetadata): ResponseDescription {
        if (!response) {
            return {
                responseKind: 'empty',
                responseType: undefined,
                wireResponseType: EMPTY_MESSAGE,
                isNullablePrimitive: false
            };
        }

        const className = response.responseClass.name;
        const isPrimitive = isPrimitiveType(response.responseClass);
        const responseType = isPrimitive ? NATIVE_TYPES[className] : className;

        if (response.isArray) {
            return {
                responseKind: isPrimitive ? 'nativeList' : 'list',
                responseType,
                wireResponseType: `Proto${className}List`,
                isNullablePrimitive: false
            };
        }

        if (isPrimitive) {
            return {
                responseKind: 'native',
                responseType,
                wireResponseType: `Native${className}Value`,
                isNullablePrimitive: Boolean(response.isAllowEmpty)
            };
        }

        if (response.isAllowEmpty) {
            return {
                responseKind: 'nullable',
                responseType,
                wireResponseType: `${NullableGrpcClassResponseNamePrefix}${className}`,
                isNullablePrimitive: false
            };
        }

        return { responseKind: 'single', responseType, wireResponseType: className, isNullablePrimitive: false };
    }

    private describeEnums(): SdkEnumDescriptor[] {
        const enums = new Map<string, SdkEnumDescriptor>();
        const properties = Object.values(extractProperties()).flat();

        for (const { option } of properties) {
            if (!isEnumProperty(option) || enums.has(option.enumName)) {
                continue;
            }

            const source = option.enum as Record<string, string | number>;
            // Numeric enums contain reverse mappings ({ ONE: 1, '1': 'ONE' }) — keep member names only
            const entries = Object.keys(source)
                .filter((key) => isNaN(Number(key)))
                .map((key) => ({ key, value: source[key] }));

            enums.set(option.enumName, {
                name: option.enumName,
                valueType: entries.every((entry) => typeof entry.value === 'number') ? 'number' : 'string',
                entries
            });
        }

        return Array.from(enums.values());
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run lib/services/sdk-descriptor.service.spec.ts`
Expected: PASS, including the proto agreement test.

- [ ] **Step 7: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 6: `ProtocService`

**Files:**
- Create: `lib/services/protoc.service.ts`
- Test: `lib/services/protoc.service.spec.ts`

**Interfaces:**
- Consumes: `SdkToolRequirement` (Task 1); `findBinary`, `readBinaryVersion`, `runBinary` (Task 3).
- Produces: `class ProtocService { assertTools(tools: SdkToolRequirement[]): void; run(args: string[], cwd: string): void }`

- [ ] **Step 1: Write the failing tests**

Create `lib/services/protoc.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocService } from './protoc.service.js';

vi.mock('../helpers/shell.helper.js', () => ({
    findBinary: vi.fn(),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

const { findBinary, readBinaryVersion, runBinary } = await import('../helpers/shell.helper.js');

describe('ProtocService', () => {
    const tools = [
        { binary: 'protoc', install: 'brew install protobuf' },
        { binary: 'protoc-gen-go', version: '1.36', install: 'go install protoc-gen-go@v1.36.6' }
    ];

    beforeEach(() => {
        vi.mocked(findBinary).mockReset().mockReturnValue('/usr/bin/tool');
        vi.mocked(readBinaryVersion).mockReset().mockReturnValue('1.36.6');
        vi.mocked(runBinary).mockReset();
    });

    it('accepts tools that are present in a supported version', () => {
        expect(() => new ProtocService().assertTools(tools)).not.toThrow();
    });

    it('does not read the version of a tool without a version requirement', () => {
        new ProtocService().assertTools([tools[0]]);

        expect(readBinaryVersion).not.toHaveBeenCalled();
    });

    it('lists every missing tool with its install command in one error', () => {
        vi.mocked(findBinary).mockReturnValue(null);

        expect(() => new ProtocService().assertTools(tools)).toThrow(
            'Missing or unsupported SDK build tools:\n' +
                '- protoc is not on PATH. Install: brew install protobuf\n' +
                '- protoc-gen-go is not on PATH. Install: go install protoc-gen-go@v1.36.6'
        );
    });

    it('rejects a tool whose major.minor differs from the pinned one', () => {
        vi.mocked(readBinaryVersion).mockReturnValue('1.35.2');

        expect(() => new ProtocService().assertTools(tools)).toThrow(
            '- protoc-gen-go 1.35.2 is not supported (need 1.36.x). Install: go install protoc-gen-go@v1.36.6'
        );
    });

    it('accepts a tool that does not report a version', () => {
        vi.mocked(readBinaryVersion).mockReturnValue(null);

        expect(() => new ProtocService().assertTools(tools)).not.toThrow();
    });

    it('runs protoc with the given arguments and working directory', () => {
        new ProtocService().run(['--go_out=.', 'microservice.proto'], '/work/sdk-go');

        expect(runBinary).toHaveBeenCalledWith('protoc', ['--go_out=.', 'microservice.proto'], '/work/sdk-go');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/services/protoc.service.spec.ts`
Expected: FAIL — `protoc.service.js` not found.

- [ ] **Step 3: Implement**

Create `lib/services/protoc.service.ts`:

```ts
import { SdkToolRequirement } from '../constants/sdk-toolchain.const.js';
import { findBinary, readBinaryVersion, runBinary } from '../helpers/shell.helper.js';

export class ProtocService {
    /**
     * Generated stubs only compile against matching runtime libraries, so a plugin outside the pinned
     * major.minor is rejected. A tool that does not report a version is accepted on its PATH presence.
     */
    assertTools(tools: SdkToolRequirement[]): void {
        const problems: string[] = [];

        for (const tool of tools) {
            if (!findBinary(tool.binary)) {
                problems.push(`- ${tool.binary} is not on PATH. Install: ${tool.install}`);
                continue;
            }
            if (!tool.version) {
                continue;
            }

            const actual = readBinaryVersion(tool.binary);
            if (actual && actual.split('.').slice(0, 2).join('.') !== tool.version) {
                problems.push(
                    `- ${tool.binary} ${actual} is not supported (need ${tool.version}.x). Install: ${tool.install}`
                );
            }
        }

        if (problems.length) {
            throw new Error(`Missing or unsupported SDK build tools:\n${problems.join('\n')}`);
        }
    }

    run(args: string[], cwd: string): void {
        runBinary('protoc', args, cwd);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/services/protoc.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 7: Go SDK generator

**Files:**
- Create: `lib/templates/go/go-mod.hbs`, `lib/templates/go/client.hbs`, `lib/templates/go/errors.hbs`, `lib/templates/go/enums.hbs`
- Create: `lib/services/go-sdk-generator.service.ts`
- Test: `lib/services/go-sdk-generator.service.spec.ts`

**Interfaces:**
- Consumes: `SdkDescriptorService` (Task 5), `ProtocService` (Task 6), `cleanOwnedPaths` / `GO_OWNED_PATHS` (Task 4), `GO_SDK_TOOLCHAIN` / `PROTOC_TOOL` (Task 1), `toGoCamelCase` / `toGoPackageName` / `toUpperCamelCase` (Task 3), `findBinary` / `runBinary` (Task 3).
- Produces: `class GoSdkGeneratorService { constructor(config: SdkBuildConfigType, protocService?: ProtocService); generate(): void }`

Template rule for this task and Task 8: never write a literal `{{` in Go or Rust code inside a `.hbs` file — Handlebars would read it as a tag. Triple braces `{{{value}}}` are used wherever the value contains `*`, `[`, `&`, `"` or `<`, because double braces HTML-escape.

- [ ] **Step 1: Write the failing test**

Create `lib/services/go-sdk-generator.service.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { GoSdkGeneratorService } from './go-sdk-generator.service.js';

// No gofmt / go in unit tests: formatting is skipped when the binary is not found.
vi.mock('../helpers/shell.helper.js', () => ({
    findBinary: vi.fn().mockReturnValue(null),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

describe('GoSdkGeneratorService', () => {
    let workDir: string;
    let outputDir: string;
    let config: SdkBuildConfigType;
    let protoc: { assertTools: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    const read = (file: string): string => fs.readFileSync(path.join(outputDir, file), 'utf8');

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-sdk-'));
        outputDir = path.join(workDir, 'sdk-go');
        config = {
            name: 'fixturePkg',
            packageName: '@scope/sdk',
            output: path.join(workDir, 'sdk'),
            go: { module: 'github.com/acme/fixture-sdk-go', output: outputDir }
        };
        protoc = {
            assertTools: vi.fn(),
            run: vi.fn((_args: string[], cwd: string) => {
                fs.outputFileSync(path.join(cwd, 'pb/microservice.pb.go'), 'package pb\n');
                fs.outputFileSync(path.join(cwd, 'pb/microservice_grpc.pb.go'), 'package pb\n');
            })
        };
    });

    afterEach(() => {
        fs.removeSync(workDir);
    });

    it('checks the pinned Go tools before writing anything', () => {
        protoc.assertTools.mockImplementation(() => {
            throw new Error('Missing or unsupported SDK build tools');
        });

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Missing or unsupported SDK build tools'
        );
        expect(protoc.assertTools.mock.calls[0][0].map((tool) => tool.binary)).toEqual([
            'protoc',
            'protoc-gen-go',
            'protoc-gen-go-grpc'
        ]);
        expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('runs protoc so stubs land in pb/ under the module path', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(protoc.run).toHaveBeenCalledWith(
            [
                '--proto_path=.',
                '--go_out=.',
                '--go_opt=Mmicroservice.proto=github.com/acme/fixture-sdk-go/pb',
                '--go_opt=module=github.com/acme/fixture-sdk-go',
                '--go-grpc_out=.',
                '--go-grpc_opt=Mmicroservice.proto=github.com/acme/fixture-sdk-go/pb',
                '--go-grpc_opt=module=github.com/acme/fixture-sdk-go',
                'microservice.proto'
            ],
            outputDir
        );
        expect(fs.existsSync(path.join(outputDir, 'microservice.proto'))).toBe(true);
    });

    it('writes go.mod with the module path and pinned dependencies', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const goMod = read('go.mod');
        expect(goMod).toContain('module github.com/acme/fixture-sdk-go');
        expect(goMod).toContain('go 1.23');
        expect(goMod).toContain('google.golang.org/grpc v1.71.0');
        expect(goMod).toContain('google.golang.org/protobuf v1.36.6');
    });

    it('writes one client per service in the package named after the module', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain('package fixturesdkgo');
        expect(client).toContain('"github.com/acme/fixture-sdk-go/pb"');
        expect(client).toContain('type SdkFixtureMicroserviceClient struct');
        expect(client).toContain(
            'func NewSdkFixtureMicroserviceClient(conn grpc.ClientConnInterface, opts ...Option) *SdkFixtureMicroserviceClient'
        );
    });

    it('unwraps each response kind into its Go type', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain(
            'FindOne(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain(
            'FindMany(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) ([]*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain('GetName(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (string, error)');
        expect(client).toContain(
            'CountItems(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (float32, error)'
        );
        expect(client).toContain('IsActive(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (bool, error)');
        expect(client).toContain(
            'GetTags(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) ([]string, error)'
        );
        expect(client).toContain(
            'MaybeFindOne(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain('Ping(ctx context.Context, opts ...Option) error');
        expect(client).toContain('return res.GetItems(), nil');
        expect(client).toContain('return res.GetValue(), nil');
        expect(client).toContain('c.client.Ping(ctx, &emptypb.Empty{})');
    });

    it('returns a typed stream for streaming methods', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(read('client.go')).toContain(
            'WatchItems(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*Stream[*pb.FixtureItemResponse], error)'
        );
    });

    it('documents the description and the metadata keys of a method', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain('// GetWorkspace Get the workspace of the caller');
        expect(client).toContain('// Metadata read by the server: workspace-id.');
    });

    it('writes typed constants for string and numeric enums', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const enums = read('enums.go');
        expect(enums).toContain('type FixtureStatusEnum string');
        expect(enums).toContain('FixtureStatusEnumSuperAdmin FixtureStatusEnum = "super_admin"');
        expect(enums).toContain('type FixtureLevelEnum int32');
        expect(enums).toContain('FixtureLevelEnumHigh FixtureLevelEnum = 2');
    });

    it('maps ABORTED status messages to *Error', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const errors = read('errors.go');
        expect(errors).toContain('package fixturesdkgo');
        expect(errors).toContain('codes.Aborted');
        expect(errors).toContain('st.Message()');
    });

    it('keeps files it does not own when regenerating', () => {
        fs.outputFileSync(path.join(outputDir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(outputDir, 'go.sum'), 'sum');
        fs.outputFileSync(path.join(outputDir, 'pb/stale.pb.go'), 'stale');

        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(fs.existsSync(path.join(outputDir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'go.sum'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'pb/stale.pb.go'))).toBe(false);
    });

    it('fails when build is requested but go is not installed', () => {
        config.go.build = true;

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).toThrow(
            '"go.build" is true but go is not on PATH'
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/services/go-sdk-generator.service.spec.ts`
Expected: FAIL — `go-sdk-generator.service.js` not found.

- [ ] **Step 3: Create the templates**

Create `lib/templates/go/go-mod.hbs`:

```handlebars
module {{{module}}}

go {{goVersion}}

require (
	google.golang.org/grpc {{grpcVersion}}
	google.golang.org/protobuf {{protobufVersion}}
)
```

Create `lib/templates/go/errors.hbs`:

```handlebars
// Code generated by @hodfords/nestjs-grpc-helper. DO NOT EDIT.

package {{packageName}}

import (
	"encoding/json"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Error is a business error returned by the service. The server sends it as an ABORTED status
// whose message is the JSON object {"message", "code", "errors"}.
type Error struct {
	Code    int
	Message string
	Errors  json.RawMessage
	status  *status.Status
}

func (e *Error) Error() string {
	return fmt.Sprintf("service error %d: %s", e.Code, e.Message)
}

// GRPCStatus returns the original status, so status.FromError keeps working.
func (e *Error) GRPCStatus() *status.Status {
	return e.status
}

type errorPayload struct {
	Message json.RawMessage `json:"message"`
	Code    int             `json:"code"`
	Errors  json.RawMessage `json:"errors"`
}

func wrapError(err error) error {
	st, ok := status.FromError(err)
	if !ok || st.Code() != codes.Aborted {
		return err
	}

	var payload errorPayload
	if json.Unmarshal([]byte(st.Message()), &payload) != nil {
		return err
	}

	message := string(payload.Message)
	var text string
	if json.Unmarshal(payload.Message, &text) == nil {
		message = text
	}

	return &Error{Code: payload.Code, Message: message, Errors: payload.Errors, status: st}
}
```

Create `lib/templates/go/enums.hbs`:

```handlebars
// Code generated by @hodfords/nestjs-grpc-helper. DO NOT EDIT.

package {{packageName}}
{{#each enums}}

// {{goName}} lists the values accepted for {{name}} fields. The field itself keeps its wire type.
type {{goName}} {{goType}}

const (
{{#each entries}}
	{{constName}} {{../goName}} = {{{literal}}}
{{/each}}
)
{{/each}}
```

Create `lib/templates/go/client.hbs`:

```handlebars
// Code generated by @hodfords/nestjs-grpc-helper. DO NOT EDIT.

package {{packageName}}

import (
	"context"
	"errors"
	"io"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/emptypb"

	"{{{module}}}/pb"
)

var _ *emptypb.Empty

// Option configures a client or a single call.
type Option func(*config)

type config struct {
	timeout time.Duration
	md      metadata.MD
}

// WithTimeout sets the deadline of unary calls. Passed to a constructor it is the default;
// passed to a call it overrides the default. Streams only use a timeout passed to the call.
func WithTimeout(timeout time.Duration) Option {
	return func(c *config) {
		c.timeout = timeout
	}
}

// WithMetadata adds outgoing gRPC metadata.
func WithMetadata(md metadata.MD) Option {
	return func(c *config) {
		c.md = metadata.Join(c.md, md)
	}
}

func newConfig(opts []Option) config {
	var c config
	for _, opt := range opts {
		opt(&c)
	}
	return c
}

func (c config) with(opts []Option) config {
	next := config{timeout: c.timeout, md: c.md.Copy()}
	for _, opt := range opts {
		opt(&next)
	}
	return next
}

func (c config) withoutTimeout() config {
	return config{md: c.md.Copy()}
}

func prepare(ctx context.Context, cfg config) (context.Context, context.CancelFunc) {
	if len(cfg.md) > 0 {
		existing, _ := metadata.FromOutgoingContext(ctx)
		ctx = metadata.NewOutgoingContext(ctx, metadata.Join(existing, cfg.md))
	}
	if cfg.timeout > 0 {
		return context.WithTimeout(ctx, cfg.timeout)
	}
	return context.WithCancel(ctx)
}

// Stream is a typed server stream. Recv returns io.EOF when the server has finished.
type Stream[T any] struct {
	recv   func() (T, error)
	cancel context.CancelFunc
}

func (s *Stream[T]) Recv() (T, error) {
	value, err := s.recv()
	if err != nil {
		s.cancel()
	}
	return value, err
}

// Close stops the stream before the server has finished.
func (s *Stream[T]) Close() {
	s.cancel()
}

func wrapStreamError(err error) error {
	if errors.Is(err, io.EOF) {
		return io.EOF
	}
	return wrapError(err)
}
{{#each services}}

{{#each docLines}}
// {{{this}}}
{{/each}}
type {{clientName}} struct {
	client   pb.{{pbClientName}}
	defaults config
}

func New{{clientName}}(conn grpc.ClientConnInterface, opts ...Option) *{{clientName}} {
	client := &{{clientName}}{client: pb.New{{pbClientName}}(conn), defaults: newConfig(opts)}
	return client
}
{{#each methods}}

{{#each docLines}}
// {{{this}}}
{{/each}}
func (c *{{clientName}}) {{goName}}(ctx context.Context{{#if hasRequest}}, req {{{requestType}}}{{/if}}, opts ...Option) {{{signatureReturn}}} {
{{#if isStream}}
	ctx, cancel := prepare(ctx, c.defaults.withoutTimeout().with(opts))
	stream, err := c.client.{{goName}}(ctx, {{{requestArg}}})
	if err != nil {
		cancel()
		return nil, wrapError(err)
	}
	recv := func() ({{{returnType}}}, error) {
		res, err := stream.Recv()
		if err != nil {
			var zero {{{returnType}}}
			return zero, wrapStreamError(err)
		}
		return {{{unwrapExpr}}}, nil
	}
	return &Stream[{{{returnType}}}]{recv: recv, cancel: cancel}, nil
{{else}}
	ctx, cancel := prepare(ctx, c.defaults.with(opts))
	defer cancel()
{{#if isEmpty}}
	if _, err := c.client.{{goName}}(ctx, {{{requestArg}}}); err != nil {
		return wrapError(err)
	}
	return nil
{{else}}
	res, err := c.client.{{goName}}(ctx, {{{requestArg}}})
	if err != nil {
		return {{{zeroValue}}}, wrapError(err)
	}
	return {{{unwrapExpr}}}, nil
{{/if}}
{{/if}}
}
{{/each}}
{{/each}}
```

- [ ] **Step 4: Implement the generator**

Create `lib/services/go-sdk-generator.service.ts`:

```ts
import { Logger } from '@nestjs/common';
import fs from 'fs-extra';
import path from 'node:path';
import { GO_SDK_TOOLCHAIN, PROTOC_TOOL } from '../constants/sdk-toolchain.const.js';
import { toGoCamelCase, toGoPackageName, toUpperCamelCase } from '../helpers/sdk-naming.helper.js';
import { cleanOwnedPaths, GO_OWNED_PATHS } from '../helpers/sdk-output.helper.js';
import { findBinary, runBinary } from '../helpers/shell.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import {
    SdkDescriptor,
    SdkEnumDescriptor,
    SdkMethodDescriptor,
    SdkServiceDescriptor
} from '../types/sdk-descriptor.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { HbsGeneratorService } from './hbs-generator.service.js';
import { ProtocService } from './protoc.service.js';
import { SdkDescriptorService } from './sdk-descriptor.service.js';

const GO_NATIVE_TYPES = { string: 'string', bool: 'bool', float: 'float32' };
const GO_NATIVE_ZERO_VALUES = { string: '""', bool: 'false', float: '0' };
const GENERATED_FILES = ['client.go', 'errors.go', 'enums.go'];

export class GoSdkGeneratorService extends HbsGeneratorService {
    private logger = new Logger(GoSdkGeneratorService.name);
    private outputDir: string;

    constructor(
        private config: SdkBuildConfigType,
        private protocService: ProtocService = new ProtocService()
    ) {
        super();
        this.outputDir = path.resolve(process.cwd(), this.config.go.output);
    }

    generate(): void {
        const { module } = this.config.go;
        const packageName = toGoPackageName(module);
        const descriptor = new SdkDescriptorService(this.config.name).describe();
        if (!descriptor.services.length) {
            throw new Error('No gRPC microservice with a @GrpcAction method is registered; nothing to generate.');
        }

        this.protocService.assertTools([PROTOC_TOOL, ...GO_SDK_TOOLCHAIN.tools]);
        cleanOwnedPaths(this.outputDir, GO_OWNED_PATHS);
        new GenerateProtoService(this.config.name, this.outputDir).generate();
        this.protocService.run(
            [
                '--proto_path=.',
                '--go_out=.',
                `--go_opt=Mmicroservice.proto=${module}/pb`,
                `--go_opt=module=${module}`,
                '--go-grpc_out=.',
                `--go-grpc_opt=Mmicroservice.proto=${module}/pb`,
                `--go-grpc_opt=module=${module}`,
                'microservice.proto'
            ],
            this.outputDir
        );

        this.write(
            'go.mod',
            this.compileTemplate('go/go-mod.hbs', {
                module,
                goVersion: GO_SDK_TOOLCHAIN.goVersion,
                grpcVersion: GO_SDK_TOOLCHAIN.modules.grpc,
                protobufVersion: GO_SDK_TOOLCHAIN.modules.protobuf
            })
        );
        this.write('client.go', this.compileTemplate('go/client.hbs', this.buildClientView(descriptor, packageName)));
        this.write('errors.go', this.compileTemplate('go/errors.hbs', { packageName }));
        this.write(
            'enums.go',
            this.compileTemplate('go/enums.hbs', {
                packageName,
                enums: descriptor.enums.map((item) => this.buildEnumView(item))
            })
        );

        this.format();
        if (this.config.go.build) {
            this.build();
        }
    }

    private write(file: string, content: string): void {
        fs.outputFileSync(path.join(this.outputDir, file), content);
    }

    private buildClientView(descriptor: SdkDescriptor, packageName: string) {
        return {
            packageName,
            module: this.config.go.module,
            services: descriptor.services.map((service) => this.buildServiceView(service))
        };
    }

    private buildServiceView(service: SdkServiceDescriptor) {
        const goName = toGoCamelCase(service.name);
        const clientName = `${goName}Client`;
        const description = service.description ? ` ${service.description}` : '';

        return {
            clientName,
            pbClientName: clientName,
            docLines: `${clientName} calls the ${service.name} service.${description}`.split('\n'),
            methods: service.methods.map((method) => this.buildMethodView(method, clientName))
        };
    }

    private buildMethodView(method: SdkMethodDescriptor, clientName: string) {
        const goName = toGoCamelCase(method.name);
        const isEmpty = method.responseKind === 'empty';
        const returnType = this.returnType(method);
        const docLines = `${goName} ${method.description || `calls the ${method.name} rpc.`}`.split('\n');
        if (method.metadataKeys.length) {
            docLines.push(`Metadata read by the server: ${method.metadataKeys.join(', ')}.`);
        }

        let signatureReturn = isEmpty ? 'error' : `(${returnType}, error)`;
        if (method.isStream) {
            signatureReturn = `(*Stream[${returnType}], error)`;
        }

        return {
            clientName,
            goName,
            docLines,
            hasRequest: Boolean(method.requestType),
            requestType: method.requestType ? `*pb.${toGoCamelCase(method.requestType)}` : undefined,
            requestArg: method.requestType ? 'req' : '&emptypb.Empty{}',
            isStream: method.isStream,
            isEmpty,
            returnType,
            signatureReturn,
            zeroValue: this.zeroValue(method),
            unwrapExpr: this.unwrapExpression(method)
        };
    }

    private returnType(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'empty':
                // Only reachable for streams; unary empty responses return `error` alone.
                return '*emptypb.Empty';
            case 'list':
                return `[]*pb.${toGoCamelCase(method.responseType)}`;
            case 'native':
                return GO_NATIVE_TYPES[method.responseType];
            case 'nativeList':
                return `[]${GO_NATIVE_TYPES[method.responseType]}`;
            default:
                return `*pb.${toGoCamelCase(method.responseType)}`;
        }
    }

    private zeroValue(method: SdkMethodDescriptor): string {
        return method.responseKind === 'native' ? GO_NATIVE_ZERO_VALUES[method.responseType] : 'nil';
    }

    private unwrapExpression(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'list':
            case 'nativeList':
                return 'res.GetItems()';
            case 'native':
            case 'nullable':
                return 'res.GetValue()';
            default:
                return 'res';
        }
    }

    private buildEnumView(item: SdkEnumDescriptor) {
        const goName = toGoCamelCase(item.name);

        return {
            name: item.name,
            goName,
            goType: item.valueType === 'number' ? 'int32' : 'string',
            entries: item.entries.map((entry) => {
                if (item.valueType === 'number' && !Number.isInteger(entry.value)) {
                    throw new Error(`Enum ${item.name}.${entry.key} is not an integer; Go enums are generated as int32.`);
                }
                return {
                    constName: `${goName}${toUpperCamelCase(entry.key)}`,
                    literal: item.valueType === 'number' ? String(entry.value) : JSON.stringify(entry.value)
                };
            })
        };
    }

    private format(): void {
        if (!findBinary('gofmt')) {
            this.logger.warn('gofmt is not on PATH; the generated Go files are left unformatted.');
            return;
        }
        runBinary('gofmt', ['-w', ...GENERATED_FILES], this.outputDir);
    }

    private build(): void {
        if (!findBinary('go')) {
            throw new Error('"go.build" is true but go is not on PATH.');
        }
        this.logger.log('Building the Go SDK');
        runBinary('go', ['mod', 'tidy'], this.outputDir);
        runBinary('go', ['build', './...'], this.outputDir);
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/services/go-sdk-generator.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Compile the generated module for real**

This is the gate the unit test cannot give. Run the generator through vitest with a throwaway spec inside the repo, so decorators and ESM imports work. Create `tests/tmp-go-build.spec.ts`:

```ts
import 'reflect-metadata';
import { it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import './fixtures/sdk-fixture.microservice.js';
import { GoSdkGeneratorService } from '../lib/services/go-sdk-generator.service.js';

it('builds the generated Go module', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'go-sdk-build-'));
    new GoSdkGeneratorService({
        name: 'fixturePkg',
        packageName: '@scope/sdk',
        output: path.join(output, 'ts'),
        go: { module: 'example.com/fixture-sdk-go', output: path.join(output, 'go'), build: true }
    }).generate();
    console.log('generated in', output);
}, 600_000);
```

Run: `pnpm vitest run tests/tmp-go-build.spec.ts`
Expected: PASS (`go mod tidy` needs network access). If `go build` reports an error, fix the template or view builder, add or adjust a unit test in `go-sdk-generator.service.spec.ts` that pins the corrected output, and rerun. Then delete the throwaway file: `rm tests/tmp-go-build.spec.ts`.

- [ ] **Step 7: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 8: Rust SDK generator

**Files:**
- Create: `lib/templates/rust/cargo-toml.hbs`, `lib/templates/rust/lib.hbs`, `lib/templates/rust/client.hbs`, `lib/templates/rust/error.hbs`, `lib/templates/rust/enums.hbs`
- Create: `lib/services/rust-sdk-generator.service.ts`
- Test: `lib/services/rust-sdk-generator.service.spec.ts`

**Interfaces:**
- Consumes: `SdkDescriptorService` (Task 5), `ProtocService` (Task 6), `cleanOwnedPaths` / `RUST_OWNED_PATHS` (Task 4), `RUST_SDK_TOOLCHAIN` / `PROTOC_TOOL` (Task 1), `toSnakeCase` / `toUpperCamelCase` (Task 3), `findBinary` / `runBinary` (Task 3).
- Produces: `class RustSdkGeneratorService { constructor(config: SdkBuildConfigType, protocService?: ProtocService); generate(): void }`

- [ ] **Step 1: Write the failing test**

Create `lib/services/rust-sdk-generator.service.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { RustSdkGeneratorService } from './rust-sdk-generator.service.js';

// No cargo in unit tests: formatting is skipped when the binary is not found.
vi.mock('../helpers/shell.helper.js', () => ({
    findBinary: vi.fn().mockReturnValue(null),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

describe('RustSdkGeneratorService', () => {
    let workDir: string;
    let outputDir: string;
    let config: SdkBuildConfigType;
    let prostContent: string;
    let protoc: { assertTools: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    const read = (file: string): string => fs.readFileSync(path.join(outputDir, file), 'utf8');

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-sdk-'));
        outputDir = path.join(workDir, 'sdk-rust');
        config = {
            name: 'fixturePkg',
            packageName: '@scope/sdk',
            output: path.join(workDir, 'sdk'),
            rust: { crateName: 'fixture-sdk', output: outputDir }
        };
        prostContent = '// prost\n';
        protoc = {
            assertTools: vi.fn(),
            run: vi.fn((_args: string[], cwd: string) => {
                fs.outputFileSync(path.join(cwd, 'src/generated/fixturePkg.rs'), prostContent);
                fs.outputFileSync(path.join(cwd, 'src/generated/fixturePkg.tonic.rs'), '// tonic\n');
            })
        };
    });

    afterEach(() => {
        fs.removeSync(workDir);
    });

    it('checks the pinned Rust tools before writing anything', () => {
        protoc.assertTools.mockImplementation(() => {
            throw new Error('Missing or unsupported SDK build tools');
        });

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Missing or unsupported SDK build tools'
        );
        expect(protoc.assertTools.mock.calls[0][0].map((tool) => tool.binary)).toEqual([
            'protoc',
            'protoc-gen-prost',
            'protoc-gen-tonic'
        ]);
        expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('runs protoc with the prost and tonic plugins into src/generated', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(protoc.run).toHaveBeenCalledWith(
            ['--proto_path=.', '--prost_out=src/generated', '--tonic_out=src/generated', 'microservice.proto'],
            outputDir
        );
        expect(fs.existsSync(path.join(outputDir, 'microservice.proto'))).toBe(true);
    });

    it('writes Cargo.toml with the crate name, default version and pinned crates', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const cargo = read('Cargo.toml');
        expect(cargo).toContain('name = "fixture-sdk"');
        expect(cargo).toContain('version = "0.1.0"');
        expect(cargo).toContain('prost = "0.13"');
        expect(cargo).toContain('tonic = "0.12"');
    });

    it('uses the configured crate version', () => {
        config.rust.version = '2.3.4';

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(read('Cargo.toml')).toContain('version = "2.3.4"');
    });

    it('includes both generated files when the prost file does not include the tonic file', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const lib = read('src/lib.rs');
        expect(lib).toContain('include!("generated/fixturePkg.rs");');
        expect(lib).toContain('include!("generated/fixturePkg.tonic.rs");');
    });

    it('includes only the prost file when it already includes the tonic file', () => {
        prostContent = '// prost\ninclude!("fixturePkg.tonic.rs");\n';

        new RustSdkGeneratorService(config, protoc as any).generate();

        const lib = read('src/lib.rs');
        expect(lib).toContain('include!("generated/fixturePkg.rs");');
        expect(lib).not.toContain('include!("generated/fixturePkg.tonic.rs");');
    });

    it('fails clearly when protoc did not produce the expected files', () => {
        protoc.run.mockImplementation(() => undefined);

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Expected one prost file and one tonic file in src/generated'
        );
    });

    it('writes one client per service over the tonic client', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain('pub struct SdkFixtureMicroserviceClient {');
        expect(client).toContain(
            'inner: pb::sdk_fixture_microservice_client::SdkFixtureMicroserviceClient<Channel>,'
        );
    });

    it('unwraps each response kind into its Rust type', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain(
            'pub async fn find_one(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<pb::FixtureItemResponse, SdkError>'
        );
        expect(client).toContain('-> Result<Vec<pb::FixtureItemResponse>, SdkError>');
        expect(client).toContain(
            'pub async fn get_name(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<String, SdkError>'
        );
        expect(client).toContain('-> Result<f32, SdkError>');
        expect(client).toContain('-> Result<bool, SdkError>');
        expect(client).toContain('-> Result<Vec<String>, SdkError>');
        expect(client).toContain('-> Result<Option<pb::FixtureItemResponse>, SdkError>');
        expect(client).toContain('pub async fn ping(&self, options: CallOptions) -> Result<(), SdkError>');
        expect(client).toContain('Ok(response.items)');
        expect(client).toContain('Ok(response.value)');
        expect(client).toContain('build_request((), options.timeout.or(self.options.timeout), options.metadata)');
    });

    it('returns a typed stream without the default timeout for streaming methods', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain(
            'pub async fn watch_items(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<SdkStream<pb::FixtureItemResponse>, SdkError>'
        );
        expect(client).toContain('build_request(request, options.timeout, options.metadata)');
    });

    it('documents the description and the metadata keys of a method', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain('/// Get the workspace of the caller');
        expect(client).toContain('/// Metadata read by the server: workspace-id.');
    });

    it('writes string-backed and integer-backed enums', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const enums = read('src/enums.rs');
        expect(enums).toContain('pub enum FixtureStatusEnum {');
        expect(enums).toContain('Self::SuperAdmin => "super_admin",');
        expect(enums).toContain('#[repr(i32)]');
        expect(enums).toContain('High = 2,');
    });

    it('maps ABORTED status messages to SdkError::Service', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const error = read('src/error.rs');
        expect(error).toContain('tonic::Code::Aborted');
        expect(error).toContain('status.message()');
    });

    it('keeps files it does not own when regenerating', () => {
        fs.outputFileSync(path.join(outputDir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(outputDir, 'Cargo.lock'), 'lock');
        fs.outputFileSync(path.join(outputDir, 'src/stale.rs'), 'stale');

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(fs.existsSync(path.join(outputDir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'Cargo.lock'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'src/stale.rs'))).toBe(false);
    });

    it('fails when build is requested but cargo is not installed', () => {
        config.rust.build = true;

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            '"rust.build" is true but cargo is not on PATH'
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/services/rust-sdk-generator.service.spec.ts`
Expected: FAIL — `rust-sdk-generator.service.js` not found.

- [ ] **Step 3: Create the templates**

Create `lib/templates/rust/cargo-toml.hbs`:

```handlebars
# Generated by @hodfords/nestjs-grpc-helper. Do not edit.
[package]
name = "{{crateName}}"
version = "{{version}}"
edition = "2021"

[dependencies]
prost = "{{crates.prost}}"
tonic = "{{crates.tonic}}"
tokio-stream = "{{crates.tokioStream}}"
serde_json = "{{crates.serdeJson}}"
thiserror = "{{crates.thiserror}}"
```

Create `lib/templates/rust/lib.hbs`:

```handlebars
//! Generated by @hodfords/nestjs-grpc-helper. Do not edit.

/// Messages and tonic stubs generated by protoc from `microservice.proto`.
#[allow(clippy::all)]
pub mod pb {
    include!("generated/{{{protoFile}}}");
{{#if includeTonicFile}}
    include!("generated/{{{tonicFile}}}");
{{/if}}
}

pub mod client;
pub mod enums;
pub mod error;

pub use client::*;
pub use error::SdkError;
```

Create `lib/templates/rust/error.hbs`:

```handlebars
// Generated by @hodfords/nestjs-grpc-helper. Do not edit.

/// Error returned by every SDK call.
#[derive(Debug, thiserror::Error)]
pub enum SdkError {
    /// Business error. The server sends it as an ABORTED status whose message is the JSON object
    /// `{ "message", "code", "errors" }`.
    #[error("service error {code}: {message}")]
    Service {
        code: i64,
        message: String,
        errors: serde_json::Value,
    },
    /// Any other gRPC status, unchanged.
    #[error(transparent)]
    Status(tonic::Status),
    /// Connection failure.
    #[error(transparent)]
    Transport(#[from] tonic::transport::Error),
}

impl SdkError {
    pub fn from_status(status: tonic::Status) -> Self {
        if status.code() != tonic::Code::Aborted {
            return SdkError::Status(status);
        }

        let payload = match serde_json::from_str::<serde_json::Value>(status.message()) {
            Ok(serde_json::Value::Object(payload)) => payload,
            _ => return SdkError::Status(status),
        };

        let message = match payload.get("message") {
            Some(serde_json::Value::String(text)) => text.clone(),
            Some(other) => other.to_string(),
            None => String::new(),
        };

        SdkError::Service {
            code: payload.get("code").and_then(serde_json::Value::as_i64).unwrap_or(0),
            message,
            errors: payload.get("errors").cloned().unwrap_or(serde_json::Value::Null),
        }
    }
}
```

Create `lib/templates/rust/enums.hbs`:

```handlebars
// Generated by @hodfords/nestjs-grpc-helper. Do not edit.
//
// Allowed values of enum fields. The fields themselves keep their wire type (String or i32).
{{#each enums}}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
{{#if isNumber}}
#[repr(i32)]
pub enum {{rustName}} {
{{#each entries}}
    {{variant}} = {{{literal}}},
{{/each}}
}

impl {{rustName}} {
    pub const fn value(self) -> i32 {
        self as i32
    }

    pub fn from_value(value: i32) -> Option<Self> {
        match value {
{{#each entries}}
            {{{literal}}} => Some(Self::{{variant}}),
{{/each}}
            _ => None,
        }
    }
}
{{else}}
pub enum {{rustName}} {
{{#each entries}}
    {{variant}},
{{/each}}
}

impl {{rustName}} {
    pub const fn as_str(self) -> &'static str {
        match self {
{{#each entries}}
            Self::{{variant}} => {{{literal}}},
{{/each}}
        }
    }

    pub fn from_value(value: &str) -> Option<Self> {
        match value {
{{#each entries}}
            {{{literal}}} => Some(Self::{{variant}}),
{{/each}}
            _ => None,
        }
    }
}

impl std::fmt::Display for {{rustName}} {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
{{/if}}
{{/each}}
```

Create `lib/templates/rust/client.hbs`:

```handlebars
// Generated by @hodfords/nestjs-grpc-helper. Do not edit.

use std::pin::Pin;
use std::time::Duration;

#[allow(unused_imports)]
use tokio_stream::{Stream, StreamExt};
use tonic::metadata::MetadataMap;
use tonic::transport::{Channel, Endpoint};

use crate::error::SdkError;
use crate::pb;

/// Typed server stream returned by streaming methods.
pub type SdkStream<T> = Pin<Box<dyn Stream<Item = Result<T, SdkError>> + Send + 'static>>;

/// Options shared by every call of a client.
#[derive(Clone, Debug, Default)]
pub struct ClientOptions {
    /// Default timeout of unary calls. Streams never use it.
    pub timeout: Option<Duration>,
}

/// Options of a single call.
#[derive(Clone, Debug, Default)]
pub struct CallOptions {
    pub metadata: MetadataMap,
    /// Overrides the client's default timeout. For a stream this is the only timeout applied.
    pub timeout: Option<Duration>,
}

fn build_request<T>(message: T, timeout: Option<Duration>, metadata: MetadataMap) -> tonic::Request<T> {
    let mut request = tonic::Request::new(message);
    // Metadata first: set_timeout stores the deadline in the request metadata.
    *request.metadata_mut() = metadata;
    if let Some(timeout) = timeout {
        request.set_timeout(timeout);
    }
    request
}
{{#each services}}

{{#each docLines}}
/// {{{this}}}
{{/each}}
#[derive(Clone, Debug)]
pub struct {{clientName}} {
    inner: pb::{{moduleName}}::{{tonicClientName}}<Channel>,
    options: ClientOptions,
}

impl {{clientName}} {
    /// Connects to `url`, for example `http://localhost:50051`.
    pub async fn connect(url: impl Into<String>, options: ClientOptions) -> Result<Self, SdkError> {
        let channel = Endpoint::from_shared(url.into())?.connect().await?;
        Ok(Self::new(channel, options))
    }

    /// Wraps an existing channel.
    pub fn new(channel: Channel, options: ClientOptions) -> Self {
        let inner = pb::{{moduleName}}::{{tonicClientName}}::new(channel);
        Self { inner, options }
    }
{{#each methods}}

{{#each docLines}}
    /// {{{this}}}
{{/each}}
{{#if isStream}}
    pub async fn {{fnName}}(&self{{#if hasRequest}}, request: {{{requestType}}}{{/if}}, options: CallOptions) -> Result<SdkStream<{{{returnType}}}>, SdkError> {
        let request = build_request({{{requestArg}}}, options.timeout, options.metadata);
        let stream = self.inner.clone().{{fnName}}(request).await.map_err(SdkError::from_status)?.into_inner();
        Ok(Box::pin(stream.map(|chunk| chunk.map(|response| {{{unwrapExpr}}}).map_err(SdkError::from_status))))
    }
{{else}}
    pub async fn {{fnName}}(&self{{#if hasRequest}}, request: {{{requestType}}}{{/if}}, options: CallOptions) -> Result<{{{returnType}}}, SdkError> {
        let request = build_request({{{requestArg}}}, options.timeout.or(self.options.timeout), options.metadata);
        let response = self.inner.clone().{{fnName}}(request).await.map_err(SdkError::from_status)?.into_inner();
        Ok({{{unwrapExpr}}})
    }
{{/if}}
{{/each}}
}
{{/each}}
```

- [ ] **Step 4: Implement the generator**

Create `lib/services/rust-sdk-generator.service.ts`:

```ts
import { Logger } from '@nestjs/common';
import fs from 'fs-extra';
import path from 'node:path';
import { PROTOC_TOOL, RUST_SDK_TOOLCHAIN } from '../constants/sdk-toolchain.const.js';
import { toSnakeCase, toUpperCamelCase } from '../helpers/sdk-naming.helper.js';
import { cleanOwnedPaths, RUST_OWNED_PATHS } from '../helpers/sdk-output.helper.js';
import { findBinary, runBinary } from '../helpers/shell.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { SdkEnumDescriptor, SdkMethodDescriptor, SdkServiceDescriptor } from '../types/sdk-descriptor.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { HbsGeneratorService } from './hbs-generator.service.js';
import { ProtocService } from './protoc.service.js';
import { SdkDescriptorService } from './sdk-descriptor.service.js';

const RUST_NATIVE_TYPES = { string: 'String', bool: 'bool', float: 'f32' };
const GENERATED_DIR = 'src/generated';
const DEFAULT_CRATE_VERSION = '0.1.0';

export class RustSdkGeneratorService extends HbsGeneratorService {
    private logger = new Logger(RustSdkGeneratorService.name);
    private outputDir: string;

    constructor(
        private config: SdkBuildConfigType,
        private protocService: ProtocService = new ProtocService()
    ) {
        super();
        this.outputDir = path.resolve(process.cwd(), this.config.rust.output);
    }

    generate(): void {
        const descriptor = new SdkDescriptorService(this.config.name).describe();
        if (!descriptor.services.length) {
            throw new Error('No gRPC microservice with a @GrpcAction method is registered; nothing to generate.');
        }

        this.protocService.assertTools([PROTOC_TOOL, ...RUST_SDK_TOOLCHAIN.tools]);
        cleanOwnedPaths(this.outputDir, RUST_OWNED_PATHS);
        new GenerateProtoService(this.config.name, this.outputDir).generate();
        fs.ensureDirSync(path.join(this.outputDir, GENERATED_DIR));
        this.protocService.run(
            ['--proto_path=.', `--prost_out=${GENERATED_DIR}`, `--tonic_out=${GENERATED_DIR}`, 'microservice.proto'],
            this.outputDir
        );

        this.write(
            'Cargo.toml',
            this.compileTemplate('rust/cargo-toml.hbs', {
                crateName: this.config.rust.crateName,
                version: this.config.rust.version ?? DEFAULT_CRATE_VERSION,
                crates: RUST_SDK_TOOLCHAIN.crates
            })
        );
        this.write('src/lib.rs', this.compileTemplate('rust/lib.hbs', this.locateGeneratedFiles()));
        this.write(
            'src/client.rs',
            this.compileTemplate('rust/client.hbs', {
                services: descriptor.services.map((service) => this.buildServiceView(service))
            })
        );
        this.write('src/error.rs', this.compileTemplate('rust/error.hbs', {}));
        this.write(
            'src/enums.rs',
            this.compileTemplate('rust/enums.hbs', {
                enums: descriptor.enums.map((item) => this.buildEnumView(item))
            })
        );

        this.format();
        if (this.config.rust.build) {
            this.build();
        }
    }

    private write(file: string, content: string): void {
        fs.outputFileSync(path.join(this.outputDir, file), content);
    }

    /**
     * protoc-gen-prost names its file after the proto package and protoc-gen-tonic adds `.tonic.rs`.
     * Depending on the plugin version the prost file may already `include!` the tonic file, so both
     * layouts are detected here instead of being assumed.
     */
    private locateGeneratedFiles(): { protoFile: string; tonicFile: string; includeTonicFile: boolean } {
        const generatedDir = path.join(this.outputDir, GENERATED_DIR);
        const files = fs.readdirSync(generatedDir).filter((file) => file.endsWith('.rs'));
        const tonicFiles = files.filter((file) => file.endsWith('.tonic.rs'));
        const protoFiles = files.filter((file) => !file.endsWith('.tonic.rs'));

        if (protoFiles.length !== 1 || tonicFiles.length !== 1) {
            throw new Error(
                `Expected one prost file and one tonic file in ${GENERATED_DIR}, found: ${files.join(', ') || 'none'}.`
            );
        }

        const [protoFile] = protoFiles;
        const [tonicFile] = tonicFiles;
        const protoContent = fs.readFileSync(path.join(generatedDir, protoFile), 'utf8');

        return { protoFile, tonicFile, includeTonicFile: !protoContent.includes(tonicFile) };
    }

    private buildServiceView(service: SdkServiceDescriptor) {
        const typeName = toUpperCamelCase(service.name);
        const description = service.description ? ` ${service.description}` : '';

        return {
            clientName: `${typeName}Client`,
            moduleName: `${toSnakeCase(service.name)}_client`,
            tonicClientName: `${typeName}Client`,
            docLines: `Client of the ${service.name} service.${description}`.split('\n'),
            methods: service.methods.map((method) => this.buildMethodView(method))
        };
    }

    private buildMethodView(method: SdkMethodDescriptor) {
        const docLines = (method.description || `Calls the ${method.name} rpc.`).split('\n');
        if (method.metadataKeys.length) {
            docLines.push(`Metadata read by the server: ${method.metadataKeys.join(', ')}.`);
        }

        return {
            fnName: toSnakeCase(method.name),
            docLines,
            hasRequest: Boolean(method.requestType),
            requestType: method.requestType ? `pb::${toUpperCamelCase(method.requestType)}` : undefined,
            requestArg: method.requestType ? 'request' : '()',
            isStream: method.isStream,
            returnType: this.returnType(method),
            unwrapExpr: this.unwrapExpression(method)
        };
    }

    private returnType(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'empty':
                return '()';
            case 'list':
                return `Vec<pb::${toUpperCamelCase(method.responseType)}>`;
            case 'native':
                return RUST_NATIVE_TYPES[method.responseType];
            case 'nativeList':
                return `Vec<${RUST_NATIVE_TYPES[method.responseType]}>`;
            case 'nullable':
                return `Option<pb::${toUpperCamelCase(method.responseType)}>`;
            default:
                return `pb::${toUpperCamelCase(method.responseType)}`;
        }
    }

    private unwrapExpression(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'list':
            case 'nativeList':
                return 'response.items';
            case 'native':
            case 'nullable':
                return 'response.value';
            default:
                return 'response';
        }
    }

    private buildEnumView(item: SdkEnumDescriptor) {
        const isNumber = item.valueType === 'number';

        return {
            rustName: toUpperCamelCase(item.name),
            isNumber,
            entries: item.entries.map((entry) => {
                if (isNumber && !Number.isInteger(entry.value)) {
                    throw new Error(`Enum ${item.name}.${entry.key} is not an integer; Rust enums are generated as i32.`);
                }
                return {
                    variant: toUpperCamelCase(entry.key),
                    literal: isNumber ? String(entry.value) : JSON.stringify(entry.value)
                };
            })
        };
    }

    private format(): void {
        if (!findBinary('cargo')) {
            this.logger.warn('cargo is not on PATH; the generated Rust files are left unformatted.');
            return;
        }
        runBinary('cargo', ['fmt'], this.outputDir);
    }

    private build(): void {
        if (!findBinary('cargo')) {
            throw new Error('"rust.build" is true but cargo is not on PATH.');
        }
        this.logger.log('Building the Rust SDK');
        runBinary('cargo', ['check'], this.outputDir);
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/services/rust-sdk-generator.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Compile the generated crate for real**

Create the throwaway file `tests/tmp-rust-build.spec.ts`:

```ts
import 'reflect-metadata';
import { it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import './fixtures/sdk-fixture.microservice.js';
import { RustSdkGeneratorService } from '../lib/services/rust-sdk-generator.service.js';

it('checks the generated Rust crate', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-sdk-build-'));
    new RustSdkGeneratorService({
        name: 'fixturePkg',
        packageName: '@scope/sdk',
        output: path.join(output, 'ts'),
        rust: { crateName: 'fixture-sdk', output: path.join(output, 'rust'), build: true }
    }).generate();
    console.log('generated in', output);
}, 1_200_000);
```

Run: `pnpm vitest run tests/tmp-rust-build.spec.ts`
Expected: PASS. The first `cargo check` downloads and compiles tonic and can take several minutes. If `cargo check` reports an error (for example a generated module, type or method name that differs from what the wrapper references), fix the template or view builder, add or adjust a unit test in `rust-sdk-generator.service.spec.ts` that pins the corrected output, and rerun. Then delete the throwaway file: `rm tests/tmp-rust-build.spec.ts`.

- [ ] **Step 7: Checkpoint**

Run: `pnpm test && pnpm run lint`
Expected: PASS. Do not commit.

---

### Task 9: `generateSdk` dispatch, `--lang`, nullable-primitive warning

**Files:**
- Modify: `lib/helpers/generate.helper.ts`
- Modify: `lib/commands/generate-sdk.command.ts`
- Test: `lib/helpers/generate.helper.spec.ts` (create), `lib/commands/generate-sdk.command.spec.ts` (modify)

**Interfaces:**
- Consumes: `assertSdkOutputs` (Task 4), `SdkDescriptorService` (Task 5), `GoSdkGeneratorService` (Task 7), `RustSdkGeneratorService` (Task 8), `SdkLanguage` (Task 3).
- Produces:
  - `resolveSdkLanguages(config: SdkBuildConfigType, languages?: SdkLanguage[]): SdkLanguage[]`
  - `generateSdk(config: SdkBuildConfigType, languages?: SdkLanguage[]): void` — public API; the second parameter is optional.
  - `make-sdk [configFile] --lang <language>`

- [ ] **Step 1: Write the failing tests**

Create `lib/helpers/generate.helper.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';

const generators = vi.hoisted(() => ({ ts: vi.fn(), rust: vi.fn(), go: vi.fn(), warn: vi.fn() }));

vi.mock('../services/generate-microservice.service.js', () => ({
    GenerateMicroserviceService: class {
        generate = generators.ts;
    }
}));
vi.mock('../services/rust-sdk-generator.service.js', () => ({
    RustSdkGeneratorService: class {
        generate = generators.rust;
    }
}));
vi.mock('../services/go-sdk-generator.service.js', () => ({
    GoSdkGeneratorService: class {
        generate = generators.go;
    }
}));
vi.mock('@nestjs/common', async (importOriginal) => {
    const original = await importOriginal<typeof import('@nestjs/common')>();
    return {
        ...original,
        Logger: class {
            warn = generators.warn;
            log = vi.fn();
            error = vi.fn();
        }
    };
});

const { generateSdk, resolveSdkLanguages } = await import('./generate.helper.js');

const tsOnly: SdkBuildConfigType = { name: 'fixturePkg', packageName: '@scope/sdk', output: 'sdk' };
const allLanguages: SdkBuildConfigType = {
    ...tsOnly,
    rust: { crateName: 'sdk', output: 'sdk-rust' },
    go: { module: 'example.com/sdk', output: 'sdk-go' }
};

describe('resolveSdkLanguages', () => {
    it('builds only TypeScript when no other block is configured', () => {
        expect(resolveSdkLanguages(tsOnly)).toEqual(['ts']);
    });

    it('builds every configured language when none is requested', () => {
        expect(resolveSdkLanguages(allLanguages)).toEqual(['ts', 'rust', 'go']);
    });

    it('builds only the requested languages', () => {
        expect(resolveSdkLanguages(allLanguages, ['go'])).toEqual(['go']);
    });

    it('rejects an unknown language', () => {
        expect(() => resolveSdkLanguages(allLanguages, ['python' as any])).toThrow(
            'Unknown SDK language "python". Use ts, rust or go.'
        );
    });
});

describe('generateSdk', () => {
    beforeEach(() => {
        Object.values(generators).forEach((mock) => mock.mockReset());
    });

    it('keeps building only TypeScript for an existing config', () => {
        generateSdk(tsOnly);

        expect(generators.ts).toHaveBeenCalledTimes(1);
        expect(generators.rust).not.toHaveBeenCalled();
        expect(generators.go).not.toHaveBeenCalled();
    });

    it('builds every configured language', () => {
        generateSdk(allLanguages);

        expect(generators.ts).toHaveBeenCalledTimes(1);
        expect(generators.rust).toHaveBeenCalledTimes(1);
        expect(generators.go).toHaveBeenCalledTimes(1);
    });

    it('builds a single requested language', () => {
        generateSdk(allLanguages, ['rust']);

        expect(generators.ts).not.toHaveBeenCalled();
        expect(generators.rust).toHaveBeenCalledTimes(1);
        expect(generators.go).not.toHaveBeenCalled();
    });

    it('fails before generating anything when a requested language has no config block', () => {
        expect(() => generateSdk(tsOnly, ['ts', 'go'])).toThrow(
            'Language "go" was requested but the SDK config has no "go" block'
        );
        expect(generators.ts).not.toHaveBeenCalled();
    });

    it('warns about nullable primitive responses when building Rust or Go', () => {
        generateSdk(allLanguages, ['go']);

        expect(generators.warn).toHaveBeenCalledWith(expect.stringContaining('SdkFixtureMicroservice.maybeGetName'));
    });

    it('does not warn when only TypeScript is built', () => {
        generateSdk(allLanguages, ['ts']);

        expect(generators.warn).not.toHaveBeenCalled();
    });
});
```

In `lib/commands/generate-sdk.command.spec.ts`, replace the body of `describe('GenerateSdkCommand', …)` after the `afterEach` block with:

```ts
    const createCommand = (args: string[], options: Record<string, string> = {}): GenerateSdkCommand => {
        const command = new GenerateSdkCommand();
        (command as any).program = { args, opts: () => options };
        (command as any).success = vi.fn();
        return command;
    };

    it('reads the config from the application working directory', () => {
        createCommand([]).handle();

        expect(generateSdk).toHaveBeenCalledWith({ name: 'fromApp', output: 'sdk' });
    });

    it('passes the language from --lang', () => {
        createCommand([], { lang: 'rust' }).handle();

        expect(generateSdk).toHaveBeenCalledWith({ name: 'fromApp', output: 'sdk' }, ['rust']);
    });

    it('rejects an unknown --lang value', () => {
        expect(() => createCommand([], { lang: 'python' }).handle()).toThrow(
            'Unknown --lang "python". Use ts, rust or go.'
        );
        expect(generateSdk).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/helpers/generate.helper.spec.ts lib/commands/generate-sdk.command.spec.ts`
Expected: FAIL — `resolveSdkLanguages` is not exported; `--lang` is ignored.

- [ ] **Step 3: Implement**

Replace the content of `lib/helpers/generate.helper.ts`:

```ts
import { Logger } from '@nestjs/common';
import { GenerateDocumentService } from '../services/generate-document.service.js';
import { GenerateMicroserviceService } from '../services/generate-microservice.service.js';
import { GenerateProtoService } from '../services/generate-proto.service.js';
import { GoSdkGeneratorService } from '../services/go-sdk-generator.service.js';
import { RustSdkGeneratorService } from '../services/rust-sdk-generator.service.js';
import { SdkDescriptorService } from '../services/sdk-descriptor.service.js';
import { SdkBuildConfigType, SdkLanguage } from '../types/sdk-build-config.type.js';
import { assertSdkOutputs } from './sdk-output.helper.js';

const SDK_LANGUAGES: SdkLanguage[] = ['ts', 'rust', 'go'];

export function resolveSdkLanguages(config: SdkBuildConfigType, languages?: SdkLanguage[]): SdkLanguage[] {
    if (!languages?.length) {
        return SDK_LANGUAGES.filter((language) => language === 'ts' || Boolean(config[language]));
    }

    for (const language of languages) {
        if (!SDK_LANGUAGES.includes(language)) {
            throw new Error(`Unknown SDK language "${language}". Use ts, rust or go.`);
        }
    }
    return languages;
}

/**
 * A primitive response declared nullable is emitted as Native*Value in the proto, which has no way to
 * say "no value". The Rust and Go SDKs therefore return the primitive type for these methods.
 */
function warnNullablePrimitives(config: SdkBuildConfigType): void {
    const logger = new Logger('GenerateSdk');
    for (const service of new SdkDescriptorService(config.name).describe().services) {
        for (const method of service.methods) {
            if (method.isNullablePrimitive) {
                logger.warn(
                    `${service.name}.${method.name} declares a nullable primitive response. The proto cannot carry ` +
                        `"no value" for it, so the Rust and Go SDKs return the primitive type.`
                );
            }
        }
    }
}

/**
 * Builds the SDKs described by `config`. Without `languages`, TypeScript is always built and Rust/Go
 * are built when their config block is present.
 */
export function generateSdk(config: SdkBuildConfigType, languages?: SdkLanguage[]) {
    const targets = resolveSdkLanguages(config, languages);
    assertSdkOutputs(config, targets);

    if (targets.includes('rust') || targets.includes('go')) {
        warnNullablePrimitives(config);
    }
    if (targets.includes('ts')) {
        new GenerateMicroserviceService(config).generate();
    }
    if (targets.includes('rust')) {
        new RustSdkGeneratorService(config).generate();
    }
    if (targets.includes('go')) {
        new GoSdkGeneratorService(config).generate();
    }
}

export function generateProtoService(packageName: string, dirPath: string) {
    new GenerateProtoService(packageName, dirPath).generate();
}

export function generateDocumentService(packageName: string) {
    return new GenerateDocumentService(packageName).generate();
}
```

Replace the content of `lib/commands/generate-sdk.command.ts`:

```ts
import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from '../helpers/generate.helper.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SdkLanguage } from '../types/sdk-build-config.type.js';

const LANGUAGES: SdkLanguage[] = ['ts', 'rust', 'go'];

@Command({
    signature: 'make-sdk [configFile]',
    description: 'Make sdk',
    options: [{ value: '--lang <language>', description: 'Build a single language: ts, rust or go' }]
})
@Injectable()
export class GenerateSdkCommand extends BaseCommand {
    public handle() {
        let [configFile] = this.params;
        if (!configFile) {
            configFile = 'sdk-config.json';
        }

        const { lang } = this.program.opts();
        if (lang && !LANGUAGES.includes(lang)) {
            throw new Error(`Unknown --lang "${lang}". Use ts, rust or go.`);
        }

        // The config file belongs to the consumer application, so it must be resolved
        // from the working directory instead of this package's location.
        const configPath = path.isAbsolute(configFile) ? configFile : path.resolve(process.cwd(), configFile);
        const options = JSON.parse(readFileSync(configPath, 'utf8'));
        if (lang) {
            generateSdk(options, [lang]);
        } else {
            generateSdk(options);
        }
        this.success(`Create sdk successfully!`);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/helpers/generate.helper.spec.ts lib/commands/generate-sdk.command.spec.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `pnpm test && pnpm run lint && pnpm run build`
Expected: PASS, and `dist/lib/templates/rust/` and `dist/lib/templates/go/` exist (`ls dist/lib/templates/rust dist/lib/templates/go`). Do not commit.

---

### Task 10: Integration test and CI workflow

**Files:**
- Create: `tests/sdk-integration.spec.ts`
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `generateSdk` (Task 9), `findBinary` (Task 3), the fixture (Task 5), `sample/app.microservice.ts`.
- Produces: environment variable `SDK_INTEGRATION_REQUIRED=1` turns "tool missing → skipped" into a failing test.

- [ ] **Step 1: Write the integration test**

Create `tests/sdk-integration.spec.ts`:

```ts
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../sample/app.microservice.js';
import './fixtures/sdk-fixture.microservice.js';
import { generateSdk } from '../lib/helpers/generate.helper.js';
import { findBinary } from '../lib/helpers/shell.helper.js';

const REQUIRED_TOOLS = [
    'protoc',
    'protoc-gen-prost',
    'protoc-gen-tonic',
    'protoc-gen-go',
    'protoc-gen-go-grpc',
    'cargo',
    'go'
];
const missingTools = REQUIRED_TOOLS.filter((tool) => !findBinary(tool));
const isRequired = process.env.SDK_INTEGRATION_REQUIRED === '1';
// The first cargo check downloads and compiles tonic.
const BUILD_TIMEOUT = 20 * 60_000;

describe('SDK integration toolchain', () => {
    it.runIf(isRequired)('has every required tool on PATH', () => {
        expect(missingTools).toEqual([]);
    });
});

describe.skipIf(missingTools.length > 0)('Rust and Go SDK generation', () => {
    let workDir: string;

    beforeAll(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-integration-'));
        // build: true makes generateSdk throw when `cargo check` or `go build ./...` fails.
        generateSdk(
            {
                name: 'sdkName',
                packageName: '@sample/sdk',
                output: path.join(workDir, 'ts'),
                rust: { crateName: 'sample-sdk', output: path.join(workDir, 'rust'), build: true },
                go: { module: 'example.com/sample-sdk-go', output: path.join(workDir, 'go'), build: true }
            },
            ['rust', 'go']
        );
    }, BUILD_TIMEOUT);

    afterAll(() => {
        fs.removeSync(workDir);
    });

    it('produces a Rust crate that compiles', () => {
        for (const file of ['Cargo.toml', 'microservice.proto', 'src/lib.rs', 'src/client.rs', 'src/error.rs']) {
            expect(fs.existsSync(path.join(workDir, 'rust', file))).toBe(true);
        }
        const client = fs.readFileSync(path.join(workDir, 'rust/src/client.rs'), 'utf8');
        expect(client).toContain('pub struct AppMicroserviceClient');
        expect(client).toContain('pub struct SdkFixtureMicroserviceClient');
    });

    it('produces a Go module that compiles', () => {
        for (const file of ['go.mod', 'microservice.proto', 'client.go', 'errors.go', 'enums.go']) {
            expect(fs.existsSync(path.join(workDir, 'go', file))).toBe(true);
        }
        expect(fs.existsSync(path.join(workDir, 'go/pb/microservice.pb.go'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'go/pb/microservice_grpc.pb.go'))).toBe(true);
        const client = fs.readFileSync(path.join(workDir, 'go/client.go'), 'utf8');
        expect(client).toContain('type AppMicroserviceClient struct');
        expect(client).toContain('type SdkFixtureMicroserviceClient struct');
    });

    it('does not write the TypeScript SDK when only rust and go are requested', () => {
        expect(fs.existsSync(path.join(workDir, 'ts'))).toBe(false);
    });
});
```

- [ ] **Step 2: Run it with the toolchain required**

Run: `SDK_INTEGRATION_REQUIRED=1 pnpm vitest run tests/sdk-integration.spec.ts`
Expected: PASS (4 tests). A compile failure appears as an error thrown from `beforeAll` with the `cargo` or `go` output; fix the generator or template in its own task's files, pin the fix with a unit test there, and rerun.

- [ ] **Step 3: Verify the skip and the required-mode failure**

```bash
PATH="$(dirname "$(which node)"):/usr/bin:/bin" pnpm vitest run tests/sdk-integration.spec.ts
PATH="$(dirname "$(which node)"):/usr/bin:/bin" SDK_INTEGRATION_REQUIRED=1 pnpm vitest run tests/sdk-integration.spec.ts
```

Expected: the first run reports the generation suite as skipped and exits 0; the second fails on `has every required tool on PATH`, listing the missing tools. (If `pnpm` is not found with the reduced `PATH`, add its directory to that `PATH` value.)

- [ ] **Step 4: Add the CI workflow**

Create `.github/workflows/test.yml`:

```yaml
name: Test
on:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
      - name: Install protoc
        run: sudo apt-get update && sudo apt-get install -y protobuf-compiler libprotobuf-dev
      - name: Cache protoc plugins
        id: plugins
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/bin/protoc-gen-prost
            ~/.cargo/bin/protoc-gen-tonic
            ~/go/bin/protoc-gen-go
            ~/go/bin/protoc-gen-go-grpc
          key: sdk-plugins-prost-0.4.0-tonic-0.4.1-go-1.36.6-gogrpc-1.5.1
      - name: Install protoc plugins
        if: steps.plugins.outputs.cache-hit != 'true'
        run: |
          cargo install protoc-gen-prost@0.4.0 --locked
          cargo install protoc-gen-tonic@0.4.1 --locked
          go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
          go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
      - name: Add plugin directories to PATH
        run: |
          echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          SDK_INTEGRATION_REQUIRED: '1'
```

The plugin versions here must stay equal to `lib/constants/sdk-toolchain.const.ts`. `.github/workflows/publish.yml` is not changed.

- [ ] **Step 5: Checkpoint**

Run: `SDK_INTEGRATION_REQUIRED=1 pnpm test && pnpm run lint`
Expected: PASS. Do not commit. Tell the maintainer the workflow can only be verified once a pull request runs it.

---

### Task 11: README and spell-check dictionary

**Files:**
- Modify: `README.md` (section "Generating an SDK", after the paragraph that starts "The generated package contains the proto file" and before "### Generating only the proto file")
- Modify: `cspell.json`

- [ ] **Step 1: Add the README section**

Insert before `### Generating only the proto file`:

````markdown
### Generating Rust and Go SDKs

`make-sdk` can also build a Rust crate and a Go module from the same proto. Add a `rust` and/or `go` block to
`sdk-config.json`; the existing fields keep describing the TypeScript SDK.

```json
{
    "name": "sdkName",
    "packageName": "@hodfords/package-name",
    "output": "sdk",
    "rust": {
        "crateName": "sdk-name",
        "version": "1.0.0",
        "output": "sdk-rust",
        "build": true
    },
    "go": {
        "module": "github.com/org/sdk-name-go",
        "output": "sdk-go",
        "build": true
    }
}
```

| Field            | Description                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| `rust.crateName` | Crate name written to `Cargo.toml`                                                    |
| `rust.version`   | Crate version. Defaults to `0.1.0`                                                    |
| `rust.output`    | Output directory of the crate                                                         |
| `rust.build`     | Run `cargo check` after generation and fail if it does not compile. Default `false`   |
| `go.module`      | Go module path written to `go.mod`. Go modules are versioned by git tag               |
| `go.output`      | Output directory of the module                                                        |
| `go.build`       | Run `go mod tidy` and `go build ./...` after generation. Default `false`              |

```shell
npm run wz-command make-sdk               # TypeScript plus every configured block
npm run wz-command make-sdk -- --lang=rust  # one language: ts, rust or go
```

The stubs are generated when you run `make-sdk`, so the machine that runs it needs `protoc` and the plugins below;
projects that consume the SDK do not.

```shell
brew install protobuf   # Debian/Ubuntu: apt-get install -y protobuf-compiler libprotobuf-dev
cargo install protoc-gen-prost@0.4.0 --locked
cargo install protoc-gen-tonic@0.4.1 --locked
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
```

The output directory is never wiped. Only the generated paths are replaced (`Cargo.toml`, `microservice.proto` and
`src/` for Rust; `go.mod`, `microservice.proto`, `pb/`, `client.go`, `errors.go` and `enums.go` for Go), so the
directory can be its own git repository. An output may not be the working directory or shared with another SDK.

Each microservice gets a client whose methods return the unwrapped value: a list, a native value, or an optional
model instead of the wire envelope.

```rust
use sdk_name::{AppMicroserviceClient, CallOptions, ClientOptions, SdkError, pb};

let client = AppMicroserviceClient::connect("http://localhost:50051", ClientOptions::default()).await?;
let users: Vec<pb::UserResponse> = client.find_many(pb::FindManyDto::default(), CallOptions::default()).await?;
```

```go
// import sdk "github.com/org/sdk-name-go" and "github.com/org/sdk-name-go/pb"
conn, err := grpc.NewClient("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
client := sdk.NewAppMicroserviceClient(conn, sdk.WithTimeout(5*time.Second))
users, err := client.FindMany(ctx, &pb.FindManyDto{}, sdk.WithMetadata(metadata.Pairs("workspace-id", id)))
```

Business errors (gRPC `ABORTED` carrying `{ message, code, errors }`) become `SdkError::Service` in Rust and
`*sdk.Error` in Go; every other status is returned unchanged.

Differences from the TypeScript SDK:

- Methods take the whole request message. `@SdkFlattenParams` and `@GrpcId`-style parameters are not flattened into
  arguments.
- Enum fields keep their wire type (string or integer). The allowed values are generated as typed constants in
  `enums.rs` / `enums.go`.
- `format: 'any'` fields are JSON strings; encode and decode them yourself.
- Metadata parameters (`@GrpcMetadata`, `@GrpcMetadataId`) are set through the per-call metadata option. The generated
  doc comment of each method lists the keys the server reads.
- A primitive response declared nullable returns the primitive type; it cannot express "no value".
- There is no mock client and no AI skill file.
- A `number` property must declare a `format` (`int32`, `int64`, `float` or `double`); `make-sdk` and `make:proto`
  fail with the class and property name otherwise. Numeric `@GrpcEnum` parameters default to `int32`.
````

- [ ] **Step 2: Extend the spell-check dictionary**

In `cspell.json`, add these entries to `"words"`:

```json
        "protoc",
        "prost",
        "tonic",
        "gofmt",
        "thiserror",
        "serde",
        "emptypb",
        "golang",
        "repr",
        "rustfmt",
        "nolint"
```

Then run cspell over the files changed in this plan and add any other flagged technical word to the same list:

```bash
pnpm run cspell --no-must-find-files README.md lib/constants/sdk-toolchain.const.ts lib/helpers/*.ts lib/services/*sdk*.ts lib/services/protoc.service*.ts lib/templates/go/*.hbs lib/templates/rust/*.hbs tests/**/*.ts .github/workflows/test.yml
```

Expected: `Issues found: 0`.

- [ ] **Step 3: Final checkpoint**

Run: `SDK_INTEGRATION_REQUIRED=1 pnpm test && pnpm run lint && pnpm run build`
Expected: PASS. Run `git status --short` and confirm that `sdk-config.json`, `lib/services/generate-microservice.service.ts`, and every pre-existing file in `lib/templates/*.hbs` are **not** listed as modified. Do not commit; report the list of changed files to the maintainer.
