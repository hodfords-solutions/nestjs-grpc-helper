# Rust and Go SDK generation — design

Date: 2026-11-18
Status: approved design (reviewed 2026-11-18), pending implementation plan

## Goal

`make-sdk` currently produces a TypeScript SDK package. Extend it so the same `sdk-config.json` can also produce a
Rust crate and a Go module for the same microservices, each with a typed client wrapper that hides the library's
wire conventions (list / native / nullable envelopes, `ABORTED` error payloads).

## Decisions

| Topic            | Decision                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Scope            | Typed client wrapper per microservice. No mock client, no `SKILL.md` for Rust/Go.                 |
| Stub generation  | Pre-generated at `make-sdk` time with `protoc` + plugins. SDK consumers do not need `protoc`.     |
| Config           | Optional `rust` and `go` blocks in `sdk-config.json`. Existing top-level fields stay TypeScript.  |
| CLI              | `make-sdk [configFile] [--lang=ts\|rust\|go]`. Without `--lang`, every configured language builds. |
| TypeScript SDK   | Generator is not refactored. Output stays byte-identical, except for maintainer-approved `GenerateProtoService` fixes (see Risk). |

## Config

```json
{
    "name": "sdkName",
    "packageName": "@scope/sdk",
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

`SdkBuildConfigType` gains:

```ts
rust?: { crateName: string; version?: string; output: string; build?: boolean };
go?: { module: string; output: string; build?: boolean };
```

- `rust.version` defaults to `0.1.0`. Go modules are versioned by git tag, so `go` has no version field.
- `build` defaults to `false`. When `true`, the generated package is compiled as a verification step
  (`cargo check` / `go mod tidy && go build ./...`) and `make-sdk` fails if compilation fails.
- A block that is absent means that language is not built. `--lang=rust` with no `rust` block is an error.
- `--lang=ts` builds only TypeScript. Without `--lang`, TypeScript always builds (current behavior) plus every
  configured block.
- `--lang` is declared through `@Command({ options: [{ value: '--lang <language>' }] })`, which
  `@hodfords/nestjs-command` 12.1.1 registers on commander, and is read from `this.program.opts()`.
- `generateSdk` is public API (`lib/index.ts`). Its new second parameter `languages?: SdkLanguage[]` is optional;
  omitted means "TypeScript plus every configured block", so existing callers are unaffected.

### Output directory safety

Rust and Go outputs are often their own git repositories, so generators never wipe the output directory.

- `make-sdk` fails before writing anything if a `rust.output` / `go.output` resolves to the working directory, or to
  the same path as the TypeScript `output` / `outputBuild` or as each other.
- A generator generates everything (proto, stubs, wrapper) into a staging directory next to the output first; only
  when that succeeded does it remove the paths it owns in the output and move the staged ones in, so a failure while
  generating (proto, protoc, rendering) leaves the previous SDK untouched. Formatting, `go mod tidy` and the optional
  `rust.build` / `go.build` compile run after that move, so a failure there leaves the newly generated files in place. Rust: `Cargo.toml`, `microservice.proto`, `src/`.
  Go: `go.mod`, `microservice.proto`, `pb/`, `client.go`, `errors.go`, `enums.go`. Everything else (`.git`, `go.sum`,
  `Cargo.lock`, `README.md`, CI files) is left alone.

## Architecture

```
GenerateSdkCommand
  └─ generateSdk(config, languages?)
       ├─ GenerateMicroserviceService        (existing, TypeScript, untouched)
       ├─ RustSdkGeneratorService ─┐
       └─ GoSdkGeneratorService  ──┼─ SdkDescriptorService   (reflection → neutral model)
                                   ├─ GenerateProtoService   (existing, writes microservice.proto)
                                   └─ ProtocService          (tool checks + protoc invocation)
```

### `SdkDescriptorService` — `lib/services/sdk-descriptor.service.ts`

Reads `microserviceStorage` and reflection metadata once and returns a language-neutral model. It is the only new
code that touches reflection.

```ts
type SdkResponseKind = 'empty' | 'single' | 'list' | 'native' | 'nativeList' | 'nullable';

type SdkMethodDescriptor = {
    name: string;                 // rpc name as written in the proto, e.g. findMany
    description?: string;         // from @GrpcAction
    requestType?: string;         // proto message name; undefined → google.protobuf.Empty
    responseKind: SdkResponseKind;
    responseType?: string;        // message name, or 'string' | 'bool' | 'float' for native kinds
    wireResponseType: string;     // message on the wire, e.g. ProtoUserResponseList
    isStream: boolean;
    metadataKeys: string[];       // names from @GrpcMetadata / @GrpcMetadataId, e.g. ['workspace-id']
};

type SdkServiceDescriptor = { name: string; description?: string; methods: SdkMethodDescriptor[] };
type SdkEnumDescriptor = {
    name: string;
    valueType: 'string' | 'number';   // from the property's `type`; @GrpcEnum derives it from the enum members
    entries: { key: string; value: string | number }[];
};
type SdkDescriptor = { packageName: string; services: SdkServiceDescriptor[]; enums: SdkEnumDescriptor[] };
```

The response classification mirrors `GenerateProtoService.generateRpcMethod`, including its branch order: a
primitive response class is `native` even when `isAllowEmpty` is set, because the proto emits `Native{X}Value` for it.
This is a second copy of that logic (the TypeScript generator has its own), so agreement is enforced by a test that
parses the generated `microservice.proto` and compares every rpc's request and response message with the descriptor's
`requestType` and `wireResponseType`. A streaming method keeps its `responseKind` and sets `isStream`; each chunk is
unwrapped by kind.

### `ProtocService` — `lib/services/protoc.service.ts`

- `assertTools(tools: string[])`: checks each binary is on `PATH` and, where the tool reports one, that its version
  is in the supported range. On a miss, throws one error listing every missing or unsupported tool with its install
  command.
- `run(args: string[], cwd: string)`: runs `protoc` through the existing `runCommand` helper.

Required tools and install hints:

| Language | Tools                                                  | Install hint                                                                                   |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| both     | `protoc`                                               | `brew install protobuf` / distro package                                                       |
| Rust     | `protoc-gen-prost`, `protoc-gen-tonic`                 | `cargo install protoc-gen-prost protoc-gen-tonic`                                              |
| Go       | `protoc-gen-go`, `protoc-gen-go-grpc`                  | `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest` and `.../grpc/cmd/protoc-gen-go-grpc@latest` |

The Go package path is passed with `--go_opt=Mmicroservice.proto=<module>/pb` together with
`--go_opt=module=<module>` (and the `--go-grpc_opt` equivalents), with `--go_out=<output>`. The `M` flag sets the
import path without editing `microservice.proto`, so the TypeScript SDK is unaffected; the `module=` flag strips the
module prefix so files land in `<output>/pb/` instead of `<output>/<module>/pb/`.

**Version pinning.** Generated stubs only compile against matching runtime libraries (tonic's generated code is
tied to the `tonic` / `prost` release; `protoc-gen-go-grpc` output asserts a minimum `grpc` version). One tested
version set — plugin versions plus the `tonic` / `prost` / `google.golang.org/grpc` / `google.golang.org/protobuf`
versions written into `Cargo.toml` and `go.mod` — lives in a single constants file. The exact numbers are fixed in
the first implementation task, after the tools are installed and the sample compiles. The install hints print the
pinned versions rather than `@latest`.

### Generators — `lib/services/rust-sdk-generator.service.ts`, `lib/services/go-sdk-generator.service.ts`

Both extend `HbsGeneratorService` and follow the same steps:

1. `ProtocService.assertTools(...)` with the generator's static `requiredTools` (`generateSdk` already checked the
   union of every requested target before any SDK, including TypeScript, was generated).
2. Render the wrapper files from the `SdkDescriptor` with templates under `lib/templates/rust/` or
   `lib/templates/go/`.
3. In a staging directory next to the output: write `microservice.proto` with `GenerateProtoService`, run `protoc`
   to emit stubs, write the wrapper files.
4. Replace only the generator-owned paths of the output with the staged ones (see "Output directory safety").
5. Format (`cargo fmt` / `gofmt -w`), then compile if `build` is `true`.

`scripts/copy-assets.mjs` and `scripts/publish.sh` already copy `lib/templates` recursively, so the new
sub-directories ship without a build change.

## Generated packages

### Rust crate

```
sdk-rust/
  Cargo.toml              # tonic, prost, tokio, tokio-stream, serde, serde_json, thiserror
  microservice.proto
  src/
    lib.rs                # pub mod pb (includes generated/); pub mod client; pub mod error; pub mod enums
    generated/<package>.rs, <package>.tonic.rs   # protoc output, exposed as `pb`
    client.rs             # one client struct per microservice
    error.rs              # SdkError
    enums.rs              # string-backed enums
```

```rust
let client = AppMicroserviceClient::connect("http://localhost:50051", ClientOptions::default()).await?;
let users: Vec<pb::UserResponse> = client.find_many(pb::FindManyDto { .. }, CallOptions::default()).await?;
```

- `ClientOptions { timeout: Option<Duration> }` — default timeout for unary calls.
- `CallOptions { metadata: MetadataMap, timeout: Option<Duration> }` — per call; overrides the default timeout.
- Method names are the rpc name in `snake_case`; a Rust keyword becomes a raw identifier (`r#move`) exactly as
  prost-build's `sanitize_identifier` does for tonic. An rpc whose name maps to `connect`, `new` or one of the other
  methods tonic-build defines on its client (`with_origin`, `with_interceptor`, `send_compressed`,
  `accept_compressed`, `max_decoding_message_size`, `max_encoding_message_size`) fails generation.

### Go module

```
sdk-go/
  go.mod                  # google.golang.org/grpc, google.golang.org/protobuf
  microservice.proto
  pb/microservice.pb.go, microservice_grpc.pb.go
  client.go               # one client struct per microservice
  errors.go               # *Error
  enums.go                # string-backed enums
```

```go
client := sdk.NewAppMicroserviceClient(conn, sdk.WithTimeout(5*time.Second))
users, err := client.FindMany(ctx, &pb.FindManyDto{...}, sdk.WithMetadata(md))
```

- The caller owns the `*grpc.ClientConn`; the SDK does not dial.
- `WithTimeout` is accepted both as a client option and a call option; metadata is a call option.
- Method and message names follow protoc-gen-go's `GoCamelCase` (`enable2fa` is `Enable2Fa`). The Go package name
  is the last path segment of `module` (the one before it when the last is a `vN` major-version suffix) with
  non-identifier characters removed and lower-cased; a Go keyword gets an `sdk` suffix.

### Return types by response kind

| Kind         | Wire message             | Rust                         | Go                    |
| ------------ | ------------------------ | ---------------------------- | --------------------- |
| `empty`      | `google.protobuf.Empty`  | `()`                         | `error` only          |
| `single`     | `T`                      | `pb::T`                      | `*pb.T`               |
| `list`       | `ProtoTList`             | `Vec<pb::T>`                 | `[]*pb.T`             |
| `native`     | `Native{X}Value`         | `String` / `bool` / `f32`    | `string` / `bool` / `float32` |
| `nativeList` | `Proto{X}List`           | `Vec<String>` etc.           | `[]string` etc.       |
| `nullable`   | `NullableT` wrapper      | `Option<pb::T>`              | `*pb.T` (nil = empty) |

A primitive response declared nullable (`@ResponseModel(String, false, true)`) is `native`, not `nullable`: its wire
message is `Native{X}Value`, which has no `grpcNullable` field. See "Known limits".

Each generated method carries a doc comment with its `@GrpcAction` description and, when `metadataKeys` is not
empty, the metadata keys the server reads for that rpc.

Streaming methods return a typed stream of the unwrapped per-chunk type (`impl Stream<Item = Result<T, SdkError>>`
in Rust; a small `Stream[T]` with `Recv() (T, error)` in Go). The default timeout does not apply to streams.

### Errors

The server sends business errors as gRPC `ABORTED` whose status message is a JSON string
`{ message, code, errors }`. grpc-js exposes that string as `error.details`; in tonic it is `Status::message()` and in
Go `status.Message()`. It is not the `grpc-status-details-bin` payload (`Status::details()` / `status.Details()`).

- `ABORTED` with parseable JSON → `SdkError::Service { code, message, errors }` / `*sdk.Error{Code, Message, Errors}`,
  where `errors` is raw JSON (`serde_json::Value` / `json.RawMessage`).
- `ABORTED` with an unparseable message, and every other status → the original gRPC status, wrapped
  (`SdkError::Status(tonic::Status)` / the original `error`, so `status.FromError` still works).
- Deadline exceeded stays a normal gRPC `DEADLINE_EXCEEDED` status.

## Known limits

- Methods take the whole request message. `@SdkFlattenParams` and `@GrpcId`-style direct parameters are not
  flattened into arguments; callers build the auto-generated request message.
- Enum fields keep their wire type (`string`, or a numeric type for numeric enums) in the generated messages; they
  are not proto enums. `enums.rs` / `enums.go` provide the allowed values as typed constants: string-backed for
  `valueType: 'string'`, integer-backed for `valueType: 'number'`. `SdkDescriptorService` leaves out, with a warning,
  an enum whose members collide or are empty once converted, that mixes string and number values, has a non-integer,
  out-of-int32-range or repeated value, or is declared `number` with non-numeric values.
- Metadata parameters (`@GrpcMetadata`, `@GrpcMetadataId`) are not method arguments. The server reads them from call
  metadata and rejects the call when its validators fail, so callers must set them through the per-call metadata
  option. The generated doc comment lists the keys. This matches the TypeScript SDK, which also leaves them to
  `requestInitializer`.
- A nullable primitive response cannot express "no value": the method returns the primitive type, not an
  `Option` / pointer. What the server actually puts on the wire for this case is unverified (see Risk).
- `format: 'any'` fields are JSON strings. Callers encode and decode them.
- No mock client, no AI skill files, no publishing step (`cargo publish` / git tagging is left to the consumer's CI).

## Risks

### Proto strictness

`microservice.proto` has only ever been loaded by `@grpc/proto-loader`, never compiled by `protoc`.

Known case, confirmed by reading `GenerateProtoService.getProtoType`: a `type: 'number'` property without `format`
is emitted as the non-existent proto type `number`. This includes `@GrpcEnum` / `@GrpcEnums` with a numeric enum,
which set `type: 'number'` and no `format`. The sample app does not contain this case (its numbers all declare
`format`), so compiling the sample alone would not reveal it.

Handling:

- The first implementation task adds a fixture microservice with a `Number` property without `format` and a numeric
  `@GrpcEnum`, and compiles both the fixture proto and the sample proto with `protoc`.
- Decided fix for the `number` case: `GenerateProtoService` fails at generation time with an error naming the class
  and property and asking for a `format`. No default type is assigned, because that would silently pick a wire type.
  No valid proto changes, so there is no wire-compatibility question. The fixture confirms that a proto containing
  `number` is not loadable today, i.e. that no working project depends on it.
- Decided fix for numeric enums: the `Property` decorator defaults an enum property whose type is `number` to
  `format: 'int32'` when no `format` is given. `@GrpcEnum` / `@GrpcEnums` reach it through the generated params DTO,
  so numeric enum parameters and `@Property({ type: Number, enum, enumName })` keep working under the rule above.
- Any other fix goes into `GenerateProtoService`, must keep the wire format compatible, and is reported to the
  maintainer before merging because it also changes the TypeScript SDK's proto.

### Nullable primitive responses

From reading `ResponseInterceptor` in `@hodfords/nestjs-response` 12.1.0 (not yet run): for
`@ResponseModel(String, false, true)` the interceptor wraps the result as `{ value: <result>, grpcNullable: true }`,
while the proto declares the response as `NativeStringValue { grpcNative, value }`. A non-null result is therefore
nested (`{ value: { value, grpcNative }, grpcNullable }`) and does not fit the message; a null result serializes to
proto defaults. This would be an existing server-side issue that also affects the TypeScript SDK.

Handling (decided): measure, do not fix here.

- The first implementation task calls the sample's `findAddressOrNull` over gRPC and records the actual wire payload.
- The Rust/Go SDKs follow the proto and treat the method as `native`.
- If the issue is confirmed, `make-sdk` logs a warning for every rpc that declares a primitive response with
  `isAllowEmpty`, and the fix is tracked as a separate issue. It is outside this spec because it lives in
  `@hodfords/nestjs-response` or in the proto shape, and changes the wire format of TypeScript SDKs already in use.

## Testing

- **Unit (vitest):** `SdkDescriptorService` covers every response kind (including nullable primitive → `native`),
  streaming, empty request, metadata keys, and string and numeric enums; plus the descriptor-versus-proto
  cross-check described above. `ProtocService` covers the missing-tool and unsupported-version error messages.
  Output-path validation covers each refusal case and that non-owned files survive regeneration. Each generator is tested on its rendered wrapper output for
  a fixture descriptor, with `ProtocService` stubbed.
- **Integration (vitest, auto-skipped when `protoc`, `cargo`, or `go` is missing):** generate both SDKs from the
  sample app and from the fixture into a temp directory with `build: true`, asserting `cargo check` and
  `go build ./...` succeed. The test builds its own config object.
- **CI:** `.github/workflows/publish.yml` runs lint and publish only — no tests, and no Rust/Go toolchain — and is
  left unchanged so the release path is neither slowed nor blocked by toolchain installation. A new workflow
  `.github/workflows/test.yml` runs on pull requests: it installs `protoc`, Rust, Go and the pinned plugins, then runs
  `pnpm test` with `SDK_INTEGRATION_REQUIRED=1`, which turns the integration test's "tool missing" skip into a
  failure.
- **Regression:** existing TypeScript generator specs pass unchanged.

## Documentation

README "Generating an SDK" gains the `rust` / `go` config blocks, the `--lang` option, the tool prerequisites with
pinned versions, and a short usage example per language.

The root `sdk-config.json` is not changed: it is copied into the published npm package, and `build:sample-sdk` does
not call `generateSdk` (the call in `sample/main.ts` is commented out), so adding blocks there would exercise nothing.
The Rust/Go path is exercised by the integration test.
