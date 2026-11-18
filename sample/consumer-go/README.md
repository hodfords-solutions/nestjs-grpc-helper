# consumer-go

A minimal example of **consuming the generated Go SDK** (`../../sdk-go`) against the `sample` gRPC server. It is the Go
counterpart of [`../consumer`](../consumer/README.md) (TypeScript) and [`../consumer-rust`](../consumer-rust/README.md).

## How it works

- [`../sdk-config.native.json`](../sdk-config.native.json) adds a `go` block (module `example.com/sample-sdk-go`, output
  `sdk-go`) and a `rust` block to the sample SDK config. Paths in it resolve from the repository root.
- `go.mod` requires `example.com/sample-sdk-go` and points it at the generated directory with
  `replace example.com/sample-sdk-go => ../../sdk-go`, so nothing is published or fetched for the SDK itself.
- `main.go` connects to `localhost:50059` (pass another address as the first argument), calls **every** rpc of
  `AppMicroservice` and prints `name -> result` as JSON. A failing call is printed as `name FAILED -> ...` and the run
  continues. The last call fails on purpose to show the business-error mapping.

## Prerequisites

- Node.js >= 20.19 and pnpm, with `pnpm install` run in the repository root.
- Go >= 1.23 (`go version`).
- `protoc` and the four pinned plugins, needed by the generator (the same list as in the main README). Installing the
  Rust plugins needs `cargo`; Rust itself is only needed to run [`../consumer-rust`](../consumer-rust/README.md).

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
   `--lang`, which writes `sdk-go/`, `sdk-rust/` and also rewrites the TypeScript SDK in `sdk/` from this config (not
   from the root `sdk-config.json`). All three directories are gitignored. `go.build` / `rust.build` are off, so
   generation needs only `protoc` and the plugins; the consumers compile the SDKs when they run.

    ```shell
    pnpm run build:sample-sdk:native
    ```

    To generate only the Go SDK, which needs only `protoc` and the two Go plugins, pass the language through:

    ```shell
    pnpm run build:sample-sdk:native --lang go
    ```

    The warning `AppMicroservice.findAddressOrNull declares a nullable primitive response` is expected (see below). If
    the `go` on `PATH` is older than 1.23 while generating, `make-sdk` also warns that it could not run `go mod tidy` in
    `sdk-go`; the example still works, because this consumer's `go.mod` / `go.sum` list every module the SDK needs.

2. Start the sample server in a second terminal (HTTP on 2013, gRPC on 50059). It runs the build from step 1; stop it
   with Ctrl+C when you are done.

    ```shell
    pnpm run start:prod
    ```

3. Run the consumer. The first run downloads the Go modules listed in `go.sum`.

    ```shell
    cd sample/consumer-go
    go run .
    ```

## Expected output

```text
findOne -> {"items":[{"name":"test"},{"name":"test2"}],"total":10,"lastPage":1,"perPage":1,"currentPage":1}
findMany -> [{"name":"test"},{"name":"test2"}]
emptyFunction -> [{"name":"test"},{"name":"test2"}]
emptyParams -> [{"name":"test"},{"name":"test2"}]
anyDto -> [{"name":"{\"source\":\"consumer\"}","isAdmin":true},{"name":"test2"}]
getUsersByName -> null
checkUserActive -> false
getUserDisplayName -> "test"
countUsers -> 1
getUserRating -> 1.5
getUserTags -> ["test","test2","test3"]
getUserPermissions -> [true,false,true]
getUserRolePriorities -> [1,0.4816515,2]
getUserWithRelations -> "123"
getUserByType -> "123"
searchUsersFlattened -> "123"
resolveAddress -> "123"
findAddressOrNull -> ""
findUserByAddress(exists) -> {"name":"test"}
findUserByAddress(missing) -> null
listUsers -> "123"
getWorkspaceId -> "123"
getUserByType(invalid userId, expected error) FAILED -> *sdk.Error code=400 message="Bad Request Exception" errors={"message":["userId must be a UUID"],"error":"Bad Request","statusCode":400}
Done: 1 call(s) failed
```

## What the output shows, and sample-server quirks

- **`getUserByType(invalid userId, expected error)`** fails on purpose. `@GrpcId` / `@GrpcIds` / `@GrpcMetadataId`
  values are validated as UUIDs; the server's `ValidationPipe` rejects `not-a-uuid` and the SDK returns the ABORTED
  status as `*sdk.Error` with code 400 (`errors.As(err, &serviceErr)`). All other ids, and the `workspace-id` metadata,
  are UUIDs for that reason.
- **`getUserRolePriorities`**: the middle value is `Math.random()` on the server, so it changes on every run. It is a
  `float32`, because `Number` responses travel as proto `float`.
- **`getUsersByName -> null`**: the handler returns an empty list; proto3 sends no items and Go decodes an empty
  repeated field as a nil slice, which `encoding/json` prints as `null`. `len()` is 0.
- **`findUserByAddress`** returns the user for address `exists` and a nil `*pb.UserResponse` with a nil error for any
  other address.
- **`findAddressOrNull -> ""`** is not a meaningful result. The rpc is declared as a nullable primitive
  (`@ResponseModel(String, false, true)`); the proto returns `NativeStringValue`, which cannot express "no value", and
  the server-side response interceptor wraps the handler's `null` in a shape that does not match that message, so the
  client decodes the default `""`. `make-sdk` warns about this rpc for that reason.
- **`emptyFunction` / `emptyParams`** succeed through the Go SDK: both handlers declare
  `@ResponseModel(UserResponse, true)` and return two users, which arrive as `ProtoUserResponseList`. `emptyParams`
  takes no request message (the rpc takes `google.protobuf.Empty`), so the Go method has only `ctx` and options.
- **Empty strings**: proto3 does not send empty strings, so a required string such as `ParamDto.name` arrives as missing
  and the `ValidationPipe` rejects the call with a 400 `*sdk.Error`. The consumer sends non-empty values.
- **`workspace-id` metadata** is set per call with `sdk.WithMetadata(metadata.Pairs("workspace-id", ...))` on
  `listUsers` and `getWorkspaceId`. Without it, or with a value that is not a UUID, the sample server answers
  `Unknown: Cannot read properties of undefined (reading 'translate')`: the metadata check throws a plain `Error`, and
  the sample's `GrpcExceptionFilter` fails while translating it because the sample app registers no translation module.
  That is a quirk of the sample app, not of the SDK; the consumer avoids it by always sending a valid UUID.
- `@SdkFlattenParams` (`searchUsersFlattened`) and `@GrpcId` / `@GrpcPagination` / `@GrpcSort` parameters are not
  flattened in Go: each method takes the whole request message (`*pb.ParamDto`, `*pb.AppMicroserviceListUsersParams`,
  ...).
- `AnyDto.data` is a `format: 'any'` field, so it is a JSON string you encode yourself; the server echoes it back as the
  first user's name.

`go.sum` is committed so `go run .` uses the same module versions as the generated SDK's `go.mod`
(`google.golang.org/grpc` v1.71.0, `google.golang.org/protobuf` v1.36.6). If the generator's pinned versions change, run
`go mod tidy` here.
