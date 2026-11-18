# consumer-rust

A minimal example of **consuming the generated Rust SDK** (`../../sdk-rust`) against the `sample` gRPC server. It is the
Rust counterpart of [`../consumer`](../consumer/README.md) (TypeScript) and
[`../consumer-go`](../consumer-go/README.md).

## How it works

- [`../sdk-config.native.json`](../sdk-config.native.json) adds a `rust` block (crate `sample-sdk`, output `sdk-rust`)
  and a `go` block to the sample SDK config. Paths in it resolve from the repository root.
- `Cargo.toml` depends on the generated crate by path (`sample-sdk = { path = "../../sdk-rust" }`, imported as
  `sample_sdk`) and on `tokio` with the `macros` and `rt-multi-thread` features.
- `src/main.rs` connects to `http://localhost:50059` (pass another URL as the first argument), calls **every** rpc of
  `AppMicroservice` and prints `name -> result` with `{:?}`. A failing call is printed as `name FAILED -> ...` and the
  run continues. The last call fails on purpose to show the business-error mapping.

## Prerequisites

- Node.js >= 20.19 and pnpm, with `pnpm install` run in the repository root.
- Rust >= 1.85 (`cargo --version`). The crate uses edition 2024 and `rust-version = "1.85"`; no crate in the committed
  `Cargo.lock` declares a `rust-version` above 1.85. (The example was run with Rust 1.100; 1.85 itself was not tested.)
- `protoc` and the four pinned plugins, needed by the generator (the same list as in the main README). Installing the Go
  plugins needs Go; Go >= 1.23 is otherwise only needed to run [`../consumer-go`](../consumer-go/README.md).

    ```shell
    brew install protobuf   # Debian/Ubuntu: apt-get install -y protobuf-compiler libprotobuf-dev
    cargo install protoc-gen-prost@0.4.0 --locked
    cargo install protoc-gen-tonic@0.4.1 --locked
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
    ```

The plugins must be on `PATH`:

```shell
export PATH="$(go env GOPATH)/bin:$HOME/.cargo/bin:$PATH"
```

## Running it

All commands start in the repository root.

1. Generate the SDKs. This builds the sample app and runs `make-sdk sample/sdk-config.native.json` once, without
   `--lang`, which writes `sdk-rust/`, `sdk-go/` and also rewrites the TypeScript SDK in `sdk/` from this config (not
   from the root `sdk-config.json`). All three directories are gitignored. `rust.build` / `go.build` are off, so
   generation needs only `protoc` and the plugins; the consumers compile the SDKs when they run.

    ```shell
    pnpm run build:sample-sdk:native
    ```

    To generate only the Rust SDK, which needs only `protoc` and the two Rust plugins, pass the language through:

    ```shell
    pnpm run build:sample-sdk:native --lang rust
    ```

    The warning `AppMicroservice.findAddressOrNull declares a nullable primitive response` is expected (see below).

2. Start the sample server in a second terminal (HTTP on 2013, gRPC on 50059). It runs the build from step 1; stop it
   with Ctrl+C when you are done.

    ```shell
    pnpm run start:prod
    ```

3. Run the consumer. The first run downloads and compiles the crates in `Cargo.lock` (about a minute).

    ```shell
    cd sample/consumer-rust
    cargo run
    ```

## Expected output

```text
findOne -> UserPaginationResponse { items: [UserResponse { name: "test", is_admin: false, r#type: "", nested: None }, UserResponse { name: "test2", is_admin: false, r#type: "", nested: None }], total: 10, last_page: 1, per_page: 1, current_page: 1 }
findMany -> [UserResponse { name: "test", is_admin: false, r#type: "", nested: None }, UserResponse { name: "test2", is_admin: false, r#type: "", nested: None }]
emptyFunction -> [UserResponse { name: "test", is_admin: false, r#type: "", nested: None }, UserResponse { name: "test2", is_admin: false, r#type: "", nested: None }]
emptyParams -> [UserResponse { name: "test", is_admin: false, r#type: "", nested: None }, UserResponse { name: "test2", is_admin: false, r#type: "", nested: None }]
anyDto -> [UserResponse { name: "{\"source\":\"consumer\"}", is_admin: true, r#type: "", nested: None }, UserResponse { name: "test2", is_admin: false, r#type: "", nested: None }]
getUsersByName -> []
checkUserActive -> false
getUserDisplayName -> "test"
countUsers -> 1.0
getUserRating -> 1.5
getUserTags -> ["test", "test2", "test3"]
getUserPermissions -> [true, false, true]
getUserRolePriorities -> [1.0, 0.79870075, 2.0]
getUserWithRelations -> "123"
getUserByType -> "123"
searchUsersFlattened -> "123"
resolveAddress -> "123"
findAddressOrNull -> ""
findUserByAddress(exists) -> Some(UserResponse { name: "test", is_admin: false, r#type: "", nested: None })
findUserByAddress(missing) -> None
listUsers -> "123"
getWorkspaceId -> "123"
getUserByType(invalid userId, expected error) FAILED -> SdkError::Service code=400 message="Bad Request Exception" errors={"error":"Bad Request","message":["userId must be a UUID"],"statusCode":400}
Done: 1 call(s) failed
```

## What the output shows, and sample-server quirks

- **`getUserByType(invalid userId, expected error)`** fails on purpose. `@GrpcId` / `@GrpcIds` / `@GrpcMetadataId`
  values are validated as UUIDs; the server's `ValidationPipe` rejects `not-a-uuid` and the SDK returns the ABORTED
  status as `SdkError::Service` with code 400. All other ids, and the `workspace-id` metadata, are UUIDs for that
  reason.
- **`getUserRolePriorities`**: the middle value is `Math.random()` on the server, so it changes on every run. Values are
  `f32`, because `Number` responses travel as proto `float` (hence `countUsers -> 1.0`).
- **Unset fields print as defaults** (`is_admin: false`, `r#type: ""`, `nested: None`): proto3 does not send default
  values, and prost decodes missing scalars as their default. `r#type` is the field `type`, a Rust keyword.
- **`findUserByAddress`** returns `Some(user)` for address `exists` and `None` without an error for any other address.
- **`findAddressOrNull -> ""`** is not a meaningful result. The rpc is declared as a nullable primitive
  (`@ResponseModel(String, false, true)`); the proto returns `NativeStringValue`, which cannot express "no value", and
  the server-side response interceptor wraps the handler's `null` in a shape that does not match that message, so the
  client decodes the default `""`. `make-sdk` warns about this rpc for that reason.
- **`emptyFunction` / `emptyParams`** succeed through the Rust SDK: both handlers declare
  `@ResponseModel(UserResponse, true)` and return two users, which arrive as `ProtoUserResponseList`. `emptyParams`
  takes no request message (the rpc takes `google.protobuf.Empty`), so the Rust method takes only `CallOptions`.
- **Empty strings**: proto3 does not send empty strings, so a required string such as `ParamDto.name` arrives as missing
  and the `ValidationPipe` rejects the call with a 400 `SdkError::Service`. The consumer sends non-empty values.
- **`workspace-id` metadata** is set per call through `CallOptions::metadata` on `list_users` and `get_workspace_id`.
  Without it, or with a value that is not a UUID, the sample server answers
  `Unknown: Cannot read properties of undefined (reading 'translate')` (`SdkError::Status`): the metadata check throws a
  plain `Error`, and the sample's `GrpcExceptionFilter` fails while translating it because the sample app registers no
  translation module. That is a quirk of the sample app, not of the SDK; the consumer avoids it by always sending a
  valid UUID.
- `@SdkFlattenParams` (`search_users_flattened`) and `@GrpcId` / `@GrpcPagination` / `@GrpcSort` parameters are not
  flattened in Rust: each method takes the whole request message (`pb::ParamDto`, `pb::AppMicroserviceListUsersParams`,
  ...).
- `AnyDto.data` is a `format: 'any'` field, so it is a JSON string you encode yourself; the server echoes it back as the
  first user's name.

`Cargo.lock` is committed, as usual for a binary, so `cargo run` uses the dependency versions this example was tested
with. Build output goes to `target/`, which is gitignored.
