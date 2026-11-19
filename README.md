<p align="center">
  <a href="http://opensource.hodfords.uk" target="blank"><img src="https://opensource.hodfords.uk/img/logo.svg" width="320" alt="Hodfords Logo" /></a>
</p>

<p align="center">
<b>nestjs-grpc-helper</b> simplifies gRPC integration in NestJS. Define your microservices with decorators, and the library generates the proto files, a fully typed TypeScript SDK, interactive documentation, and mock data — keeping every consumer of your services consistent and type-safe.
</p>

## Table of Contents 📚

- [How It Works](#how-it-works-)
- [Installation](#installation-)
- [Quick Start](#quick-start-)
- [Defining DTOs and Responses](#defining-dtos-and-responses-)
- [Decorator Reference](#decorator-reference-)
- [Type Helpers](#type-helpers-)
- [Mock Data](#mock-data-)
- [Generating an SDK](#generating-an-sdk-)
- [Using a Generated SDK](#using-a-generated-sdk-)
- [Documentation UI](#documentation-ui-)
- [Custom gRPC Client](#custom-grpc-client-)
- [Translation Support](#translation-support-)
- [AI Agent Skill](#ai-agent-skill-)
- [License](#license-)

## How It Works 🧠

The library follows a metadata-driven code generation flow:

1. **Decorators** such as `@RegisterGrpcMicroservice`, `@GrpcAction`, and `@Property` attach metadata to your classes at
   load time.
2. From that metadata, the library can generate a **`.proto` file**, a **TypeScript SDK package** that other services
   import for type-safe calls, an **interactive documentation UI**, and **mock implementations** for testing.

You write your service once; everything downstream is derived from it.

## Installation 🤖

```bash
npm install @hodfords/nestjs-grpc-helper --save
```

Responses must follow the [@hodfords/nestjs-response](https://www.npmjs.com/package/@hodfords/nestjs-response)
conventions, and the `make-sdk` / `update-ai-skill` commands run through
[@hodfords/nestjs-command](https://www.npmjs.com/package/@hodfords/nestjs-command).

## Quick Start 🚀

### 1. Define a request DTO and a response

```typescript
import { Property } from '@hodfords/nestjs-grpc-helper';
import { IsString, IsOptional } from 'class-validator';

export class GetUserByIdDto {
    @Property({ type: String, description: 'User id to look up' })
    @IsString()
    userId: string;
}

export class UserResponse {
    @Property({ type: String, required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @Property({ type: Boolean, required: false })
    isAdmin?: boolean;
}
```

### 2. Define the microservice

A gRPC microservice is declared like a controller. Each `@GrpcAction` method becomes an rpc in the generated proto and a
method in the generated SDK:

```typescript
import { GrpcAction, GrpcValue, RegisterGrpcMicroservice } from '@hodfords/nestjs-grpc-helper';
import { ResponseModel } from '@hodfords/nestjs-response';

@Controller()
@RegisterGrpcMicroservice('User microservice')
export class UserMicroservice {
    constructor(private userService: UserService) {}

    @GrpcAction('Get user by id')
    @ResponseModel(UserResponse)
    findUserById(@GrpcValue() dto: GetUserByIdDto): Promise<UserEntity> {
        return this.userService.findUserById(dto.userId);
    }
}
```

`@ResponseModel` supports single models, arrays, primitives, and nullable results:

```typescript
@ResponseModel(UserResponse)                        // single object
@ResponseModel(UserResponse, true)                  // array of objects
@ResponseModel(String)                              // primitive (String, Number, Boolean)
@ResponseModel(UserResponse, { isAllowEmpty: true }) // object or null
@ResponseModel(String, false, true)                 // primitive or null
```

For a nullable result the generated TypeScript method returns `Promise<UserResponse | null>` /
`Promise<string | null>`.

> **Upgrading to 12.5:** an rpc that returns a nullable primitive (`@ResponseModel(String, false, true)`, also with
> `Number` or `Boolean`) now declares `NullableGrpcClassResponseOfNative*Value` in the proto instead of
> `Native*Value`. Before, the proto could not carry "no value" and every SDK decoded such a response wrongly. The
> return type of these rpcs changed on the wire, so regenerate the SDK and release the service together with the
> consumers that call them. No other rpc is affected.
>
> The generated TypeScript methods of nullable rpcs (objects and primitives) are now typed `T | null`, which is what
> they already returned. A consumer compiled with `strictNullChecks` gets a compile error wherever such a result is
> used without a null check.
>
> The Rust `ClientOptions` struct gained two fields. Code that builds it with a full struct literal
> (`ClientOptions { timeout: Some(..) }`) stops compiling after the SDK is regenerated; add `..Default::default()`.

### 3. Generate the proto file and start the gRPC server

Generate the proto file before the application starts, then connect the gRPC microservice:

```typescript
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';
import { Transport } from '@nestjs/microservices';
import path from 'path';

generateProtoService('packageName', path.join(__dirname, '../../proto'));

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.connectMicroservice<GrpcOptions>({
        transport: Transport.GRPC,
        options: {
            url: '0.0.0.0:50059',
            package: 'packageName',
            protoPath: path.join(__dirname, '../../proto/microservice.proto')
        }
    });
    await app.startAllMicroservices();
    await app.listen(3000);
}
```

## Defining DTOs and Responses 📦

`@Property` is the single source of truth for a field. It registers the field for proto generation, SDK generation, and
Swagger documentation at the same time.

```typescript
export class FindManyDto {
    @Property({ type: 'string', description: 'Name of user to search' })
    @IsString()
    name: string;

    @Property({ type: ParamNestedDto, isArray: true, required: true })
    nestedDto: ParamNestedDto[];

    @Property({ type: String, required: false, enum: UserTypeEnum, enumName: 'UserTypeEnum' })
    @IsEnum(UserTypeEnum)
    @IsOptional()
    type?: UserTypeEnum;
}
```

Commonly used options (all [ApiPropertyOptions](https://docs.nestjs.com/openapi/types-and-parameters) are also
accepted):

| Option              | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `type`              | `String`, `Number`, `Boolean`, a class reference, a lazy `() => Class`, or a string literal |
| `isArray`           | Marks the field as repeated                                                                 |
| `required`          | `false` makes the field optional in the proto and SDK                                       |
| `description`       | Description used in documentation and the AI skill                                          |
| `format`            | Number type (`'int32'`, `'float'`, …; required for numbers) or `'any'` for dynamic JSON     |
| `enum` / `enumName` | Declares an enum field; `enumName` names the generated enum                                 |

> **Upgrading:** a `number` property without a `format` now fails proto generation (`make-sdk` and `make:proto`) with
> the class and property name. Such a proto used `number` as a field type and could never be loaded, so only the error
> moved earlier. A numeric enum without a `format` (`@Property({ type: Number, enum, enumName })`, `@GrpcEnum`,
> `@GrpcEnums`) now defaults to `int32`.

### Dynamic (`any`) fields

For values without a fixed schema, combine `format: 'any'` with `@AnyType`. The value is serialized to JSON on the wire
and parsed back transparently:

```typescript
@Property({ type: 'string', format: 'any' })
@AnyType()
data: any;
```

## Decorator Reference 🏷️

### Service and method decorators

| Decorator                                 | Description                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@RegisterGrpcMicroservice(description?)` | Marks a class as a gRPC microservice                                                        |
| `@GrpcAction(description?)`               | Marks a method as a gRPC action/endpoint                                                    |
| `@SdkFlattenParams()`                     | Flattens the request DTO's properties into individual arguments in the generated SDK method |

### Request parameter decorators

| Decorator            | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `@GrpcValue()`       | Marks a parameter as the request body (used with a DTO type)                  |
| `@GrpcParam(option)` | Defines a direct request parameter with name, type, and validation decorators |
| `@GrpcId(name)`      | Shortcut for a required UUID string parameter (`IsNotEmpty` + `IsUUID`)       |
| `@GrpcIds(name)`     | Shortcut for a required array of UUID strings                                 |
| `@GrpcEnum(option)`  | Enum parameter with automatic type detection and `IsEnum` validation          |
| `@GrpcEnums(option)` | Array variant of `@GrpcEnum`                                                  |
| `@GrpcPagination()`  | Built-in pagination parameter (`page`, `perPage`)                             |
| `@GrpcSort()`        | Built-in sort parameter (`sortField`, `sortDirection: 'ASC' \| 'DESC'`)       |

Direct parameters can be mixed with a `@GrpcValue` body and gRPC metadata in the same method:

```typescript
@GrpcAction('List users with pagination, sorting, and workspace scoping')
@ResponseModel(UserResponse, true)
listUsers(
    @GrpcValue() param: FilterDto,
    @GrpcPagination() pagination: PaginationDto,
    @GrpcSort() sortParam: SortDto,
    @GrpcMetadataId('workspace-id') workspaceId: string
): Promise<UserResponse[]> { ... }
```

### Metadata decorators

| Decorator               | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `@GrpcMetadata(option)` | Extracts a value from gRPC metadata (like headers) |
| `@GrpcMetadataId(name)` | Shortcut for a UUID metadata field                 |

### Property and type decorators

| Decorator             | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `@Property(option)`   | Defines a DTO/response field with type, validation, and Swagger metadata                  |
| `@AnyType(option?)`   | JSON serialization for dynamic `any` fields (`{ isDto: true }` parses into the DTO class) |
| `@ExtendType(Parent)` | Inherits the parent's property metadata when extending a composed type                    |
| `@SdkExpose()`        | Forces a class into the generated SDK even when no rpc references it                      |

## Type Helpers 🧬

Compose DTOs while preserving the property metadata needed for proto and SDK generation. These mirror the
`@nestjs/swagger` mapped types:

```typescript
import {
    PickResponseType,
    OmitResponseType,
    PartialResponseType,
    IntersectionResponseType
} from '@hodfords/nestjs-grpc-helper';

export class UserSummary extends PickResponseType(UserResponse, ['id', 'name']) {}
export class UserWithoutEmail extends OmitResponseType(UserResponse, ['email']) {}
export class UpdateUserDto extends PartialResponseType(UserResponse) {}
export class FullUser extends IntersectionResponseType(UserResponse, ProfileResponse) {}
```

## Mock Data 🎭

Mock generation powers both the documentation UI and the mock SDK module. Property-level decorators describe how each
field is faked; response-level decorators override the result of a whole method.

### Property-level decorators

| Decorator                    | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `@MockMethod(method, args?)` | Generates the value with a Faker method      |
| `@MockSample(value)`         | Uses a fixed value                           |
| `@MockNested(maxSize?)`      | Generates nested objects (or arrays of them) |

```typescript
export class UserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.firstName')
    name?: string;

    @Property({ type: String, enum: UserTypeEnum, enumName: 'UserTypeEnum' })
    @MockSample(UserTypeEnum.STANDARD)
    type: UserTypeEnum;

    @Property({ type: AddressResponse, isArray: true })
    @MockNested(5)
    addresses: AddressResponse[];
}
```

### Response-level decorators

| Decorator                            | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| `@MockResponseSample(value)`         | The mocked method returns this fixed value                          |
| `@MockResponseMethod(method, args?)` | The mocked method returns the result of a Faker method              |
| `@MockResponseCallback(callback)`    | Full control: receives the request arguments plus `(sample, model)` |

```typescript
@GrpcAction('Check if a user is active')
@ResponseModel(Boolean)
@MockResponseSample(true)
checkUserActive(@GrpcValue() param: AnyDto): Promise<boolean> { ... }

@GrpcAction('Count users')
@ResponseModel(Number)
@MockResponseMethod('faker.number.int', [{ min: 1, max: 100 }])
countUsers(@GrpcValue() param: AnyDto): Promise<number> { ... }

@GrpcAction('Get users by name')
@ResponseModel(UserResponse, true)
@MockResponseCallback((param: AnyDto, sample, model) => sample(model))
getUsersByName(@GrpcValue() param: AnyDto): Promise<UserResponse[]> { ... }
```

### Generating mock instances programmatically

```typescript
import { sample } from '@hodfords/nestjs-grpc-helper';

const mockUser = sample(UserResponse);
```

## Generating an SDK 🛠️

The `make-sdk` command collects every request and response type reachable from your `@GrpcAction` methods, generates the
proto file, and packages everything into a TypeScript SDK that other services install like any npm package.

Add an `sdk-config.json` to your project root:

```json
{
    "name": "sdkName",
    "packageName": "@hodfords/package-name",
    "format": true,
    "build": true,
    "output": "sdk",
    "outputBuild": "sdkBuild",
    "removeOutput": true,
    "addAllowDecorator": true,
    "aiSkill": {
        "name": "sdkName",
        "description": "A description of the SDK"
    },
    "tsconfig": {
        "extends": "./tsconfig.json",
        "compilerOptions": {
            "outDir": "sdkBuild"
        },
        "include": ["sdk"]
    }
}
```

| Field               | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `name`              | SDK name; also used as the proto package and gRPC service prefix                 |
| `packageName`       | npm package name of the generated SDK                                            |
| `format`            | Format the generated code with Prettier                                          |
| `build`             | Compile the generated code after generation                                      |
| `output`            | Output directory for the generated source                                        |
| `outputBuild`       | Output directory for the compiled build                                          |
| `removeOutput`      | Clear the output directory before generating                                     |
| `addAllowDecorator` | Add `@Allow()` to generated models (requires `class-validator`)                  |
| `tsconfig`          | TypeScript configuration used to build the SDK                                   |
| `aiSkill`           | Optional. Generates `SKILL.md` and `skill.json` describing the SDK for AI agents |

Then run:

```shell
npm run wz-command make-sdk
```

The generated package contains the proto file, a typed service class per microservice, all models and enums, a dynamic
module for registration, and a mock module for testing. It is published under the name and version from your
`package.json`, and its method names, arguments, and response types match your service definitions exactly.

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
        "output": "../sdk-rust",
        "build": true
    },
    "go": {
        "module": "github.com/org/sdk-name-go",
        "output": "../sdk-go",
        "build": true
    }
}
```

| Field            | Description                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| `rust.crateName` | Crate name written to `Cargo.toml`                                                     |
| `rust.version`   | Crate version. Defaults to `0.1.0`                                                     |
| `rust.output`    | Output directory of the crate                                                          |
| `rust.build`     | Run `cargo check` after generation and fail if it does not compile. Default `false`    |
| `go.module`      | Go module path written to `go.mod`. Go modules are versioned by git tag                |
| `go.output`      | Output directory of the module                                                         |
| `go.build`       | Run `go build ./...` after generation and fail if it does not compile. Default `false` |

Without `--lang`, TypeScript is always built, plus Rust and Go when their block is present. Pass `--lang` to build one
language only (`ts`, `rust` or `go`):

```shell
npm run wz-command make-sdk
npm run wz-command make-sdk -- --lang=rust
```

The stubs are generated when you run `make-sdk`, so the machine that runs it needs `protoc` and the plugins below;
projects that consume the SDK do not. Building the Rust crate (`rust.build`) needs Rust 1.85 or newer, and building the
Go module (`go.build`) needs Go 1.23 or newer. With `rust.build` / `go.build` an older toolchain is reported as an
error; the check runs in the build step, after the files are written. `protoc` and the plugins are checked first:
when one is missing or has an unsupported version, `make-sdk` fails before any SDK, including the TypeScript one, is
written, and the error lists every missing tool.

```shell
brew install protobuf   # Debian/Ubuntu: apt-get install -y protobuf-compiler libprotobuf-dev
cargo install protoc-gen-prost@0.4.0 --locked
cargo install protoc-gen-tonic@0.4.1 --locked
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
```

The output directory is never wiped. Only the generated paths are replaced (`Cargo.toml`, `microservice.proto` and
`src/` for Rust; `go.mod`, `microservice.proto`, `pb/`, `client.go`, `errors.go` and `enums.go` for Go), so the
directory can be its own git repository. Each run generates the proto, the stubs and the wrapper in a temporary
directory next to the output and replaces the generated paths only when all of that succeeded, so a failure while
generating leaves the previous SDK as it was. Formatting, `go mod tidy` and the optional `rust.build` / `go.build`
compile run after the replacement, so a failure there leaves the newly generated files in place.
An output may not be the working directory or any of its parent directories,
and may not be shared with, nested inside, or contain the TypeScript `output` / `outputBuild` or the other SDK's output
(the TypeScript generator deletes its directories on every run); a sibling directory such as `../sdk-go` is fine.
`rust.crateName` and `go.module` are required for the languages being built.

After generation the output is formatted with `cargo fmt` / `gofmt`. If the formatter is missing or fails, a warning is
logged and generation still succeeds. `go.mod` and `Cargo.toml` are rewritten on every run, so dependencies, `replace`
lines or features added there by hand are lost. `go.sum` is kept, and `make-sdk` runs `go mod tidy` in the Go output
itself when Go 1.23 or newer is on PATH; otherwise, or when `go mod tidy` fails (for example without network), it logs a
warning and you need to run `go mod tidy` before the module builds. With `go.build` a failing `go mod tidy` is an error.

Each microservice gets a client whose methods return the unwrapped value: a list, a native value, or an optional
model instead of the wire envelope. Client and method names follow the language: `AppMicroserviceClient::find_many` in
Rust, `NewAppMicroserviceClient` and `FindMany` in Go.

```rust
use sdk_name::{pb, AppMicroserviceClient, CallOptions, ClientOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = AppMicroserviceClient::connect("http://localhost:50059", ClientOptions::default()).await?;

    let mut options = CallOptions::default();
    options.metadata.insert("workspace-id", "workspace-1".parse()?);

    let users: Vec<pb::UserResponse> = client.find_many(pb::FindManyDto::default(), options).await?;
    println!("{} users", users.len());
    Ok(())
}
```

`ClientOptions` also takes `max_decoding_message_size` and `max_encoding_message_size` (in bytes). Responses larger
than tonic's default of 4 MiB are rejected unless the first one is raised; build the options with
`ClientOptions { max_decoding_message_size: Some(16 * 1024 * 1024), ..Default::default() }` so that fields added later
do not break your code. In Go the limit belongs to the connection:
`grpc.NewClient(address, grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(16 * 1024 * 1024)), ...)`.

The crate root re-exports `pb`, `SdkError`, `SdkStream`, `ClientOptions`, `CallOptions` and every client; the enum
types live in `sdk_name::enums`. A crate name with hyphens is imported with underscores, and the consuming crate needs
`tokio` (with the `macros` and `rt-multi-thread` features) for the example above.

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	sdk "github.com/org/sdk-name-go"
	"github.com/org/sdk-name-go/pb"
)

func main() {
	conn, err := grpc.NewClient("localhost:50059", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		panic(err)
	}
	defer conn.Close()

	client := sdk.NewAppMicroserviceClient(conn, sdk.WithTimeout(5*time.Second))
	users, err := client.FindMany(context.Background(), &pb.FindManyDto{},
		sdk.WithMetadata(metadata.Pairs("workspace-id", "workspace-1")))

	var serviceErr *sdk.Error
	if errors.As(err, &serviceErr) {
		fmt.Println("business error", serviceErr.Code, serviceErr.Message)
		return
	}
	if err != nil {
		panic(err)
	}
	fmt.Println(len(users), "users")
}
```

The Go package is named after the last segment of the module path, with characters that are not valid in an identifier
removed and the rest lower-cased (`github.com/org/sdk-name-go` becomes `sdknamego`), so import it with an alias as above.
A major-version suffix is skipped, as in Go (`github.com/org/sdk-go/v2` becomes `sdkgo`), and a name that is a Go
keyword gets an `sdk` suffix (`github.com/org/user-sdk/go` becomes `gosdk`).
`WithMetadata` can be passed to a constructor (as a default) and to a call; a later value for the same key replaces the
earlier one, and keys are lower-cased.

Business errors (gRPC `ABORTED` carrying `{ message, code, errors }`) become `SdkError::Service` in Rust and
`*sdk.Error` in Go; every other status is returned unchanged. A client-side timeout is reported as `DEADLINE_EXCEEDED`
in both languages. In Rust the timeout of a streaming call bounds only the wait for the first response (the response
headers), not the whole stream; in Go it bounds the whole stream.

Streaming methods return `SdkStream<T>` in Rust (a pinned, boxed `tokio_stream::Stream` of `Result<T, SdkError>`) and
`*Stream[T]` in Go. In Go, `Recv` returns `io.EOF` when the server has finished, and `Close` must be called when you stop
reading early.

Differences from the TypeScript SDK:

- Methods take the whole request message. `@SdkFlattenParams` and `@GrpcId`-style parameters are not flattened into
  arguments.
- Enum fields keep their wire type (string or integer). The allowed values are generated in `enums.rs` (Rust enums with
  `value()` / `as_str()` and `from_value()` helpers) and `enums.go` (typed constants). An enum that cannot be rendered
  safely — member names that collide or are empty once converted, mixed string and number values, a non-integer,
  out-of-int32-range or repeated value, or `type: Number` with non-numeric values — is left out of both files with a
  warning.
- `format: 'any'` fields are JSON strings; encode and decode them yourself.
- Metadata parameters (`@GrpcMetadata`, `@GrpcMetadataId`) are set through the per-call metadata option. The generated
  doc comment of each method lists the keys the server reads.
- A nullable primitive response (`@ResponseModel(String, false, true)`) is `Option<String>` in Rust and `*string` in
  Go (likewise `Option<f32>` / `*float32` and `Option<bool>` / `*bool`); `None` / `nil` means the server returned no
  value.
- There is no mock client and no AI skill file.
- `Number` responses (`@ResponseModel(Number)`) are `f32` in Rust and `float32` in Go, because the proto carries them as
  `float`.
- A `number` property must declare a `format` (`int32`, `int64`, `float` or `double`) in every SDK; `make-sdk` and
  `make:proto` fail with the class and property name otherwise. A numeric enum (`@Property` with `enum` / `enumName`,
  `@GrpcEnum`, `@GrpcEnums`) without a `format` defaults to `int32`.
- Rust method and enum variant names that are keywords follow prost / tonic: an rpc `move` is `r#move`, and an enum
  member `SELF` is the variant `Self_`. An rpc whose Rust name is `connect`, `new`, `with_origin`,
  `with_interceptor`, `send_compressed`, `accept_compressed`, `max_decoding_message_size` or
  `max_encoding_message_size` clashes with methods of the client or of tonic's generated client and fails generation;
  rename it.

#### Trying the Rust and Go SDKs

The repository has a runnable example for each language: `pnpm run build:sample-sdk:native` generates both SDKs from
the `sample` app using `sample/sdk-config.native.json` (it also rewrites the TypeScript SDK in `sdk/`; add `--lang go`
or `--lang rust` to build one language), and the consumers call every rpc of the sample server and print the results.
Follow [`sample/consumer-go/README.md`](sample/consumer-go/README.md) or
[`sample/consumer-rust/README.md`](sample/consumer-rust/README.md) for the prerequisites, commands and expected output.

### Generating only the proto file

To generate just the proto file, without building the whole SDK, use the `make:proto` command. It reuses the same
`sdk-config.json`: `name` is used as the proto package and `output` as the destination directory.

```shell
npm run wz-command make:proto
```

Both arguments are optional:

```shell
npm run wz-command make:proto sdk-config.json ./proto
```

| Argument     | Description                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `configFile` | Config file to read. Defaults to `sdk-config.json`                                                          |
| `outputPath` | Directory the `microservice.proto` file is written into. Defaults to the `output` field of the config file   |

## Using a Generated SDK 📥

### 1. Register the SDK module

```typescript
SdkNameModule.register({
    url: env.GRPC_URL,
    timeout: 5000
});
```

Available options (`MicroserviceModuleOptionType`):

| Option                    | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `url`                     | gRPC server address                                                      |
| `timeout`                 | Request timeout in milliseconds                                          |
| `ssl`                     | Use SSL credentials                                                      |
| `maxReceiveMessageLength` | Max incoming message size (default 4MB)                                  |
| `shouldLoadEmptyArray`    | Deserialize absent repeated fields as `[]`                               |
| `requestInitializer`      | Callback to enrich the outgoing `Metadata` (auth tokens, request ids, …) |
| `…`                       | Any other `@grpc/grpc-js` channel option is passed through               |

### 2. Inject the service and call it

```typescript
export class OtherService {
    constructor(private userMicroservice: UserMicroservice) {}

    async doTask(userId: string): Promise<void> {
        const user = await this.userMicroservice.findUserById({ userId });
    }
}
```

Calls are fully typed, request DTOs are serialized through their models, responses are transformed back into model
instances, and gRPC errors are translated into NestJS `HttpException`s (including timeouts).

### 3. Mock module for tests

Every SDK ships a mock module that provides the same service classes backed by the mock decorators — no gRPC server
required:

```typescript
imports: [MockSdkNameModule];
```

## Documentation UI 🖥️

The library serves an interactive UI for browsing and testing your gRPC services at
`http://your-host/microservice-documents`:

```typescript
MicroserviceDocumentModule.register({
    isEnable: env.NODE_ENV !== 'production',
    packageName: 'packageName',
    clientOptions: {
        customClass: CustomGrpcClient,
        options: {
            url: '0.0.0.0:50059',
            package: 'packageName',
            protoPath: path.join(__dirname, '../../proto/microservice.proto')
        }
    }
});
```

| Option          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `isEnable`      | Toggles the module (pass `false` to disable it entirely) |
| `packageName`   | The proto package name                                   |
| `clientOptions` | gRPC client options used by the "try it" feature         |
| `prefix`        | Optional URL prefix for the documentation routes         |
| `waitingTime`   | Optional delay before the client connects on startup     |

## Custom gRPC Client 🔌

`CustomGrpcClient` extends NestJS's `ClientGrpcProxy` with per-service client caching and support for every gRPC channel
option:

```typescript
import { CustomGrpcClient } from '@hodfords/nestjs-grpc-helper';

{
    customClass: CustomGrpcClient,
    options: {
        maxSendMessageLength: 1024 * 1024 * 50,    // 50MB max outgoing message
        maxReceiveMessageLength: 1024 * 1024 * 50, // 50MB max incoming message
        keepaliveTimeMs: 120000,                   // Keepalive ping interval
        keepaliveTimeoutMs: 20000,                 // Keepalive timeout
        keepalivePermitWithoutCalls: 1             // Allow pings without active calls
    }
}
```

Generated SDK modules use it automatically.

## Translation Support 🌍

Use `GrpcTranslationInterceptor` to extract the caller's language from gRPC metadata and run the handler in that
language context (via
[@hodfords/nestjs-cls-translation](https://www.npmjs.com/package/@hodfords/nestjs-cls-translation)):

```typescript
@UseInterceptors(GrpcTranslationInterceptor)
@GrpcAction('Get user')
@ResponseModel(UserResponse)
getUser(@GrpcValue() dto: GetUserDto): Promise<UserEntity> {
    return this.userService.getUser(dto.id);
}
```

## AI Agent Skill 🤝

When `aiSkill` is configured in `sdk-config.json`, the generated SDK ships with a `SKILL.md` and `skill.json` that
describe your services, models, and enums in a format AI agents can consume. Consumers of the SDK can install those
skills into their project with:

```shell
npm run wz-command update-ai-skill "@hodfords/*" claude
```

The first argument is a package name pattern matched against `node_modules`; the second selects the agent — `claude`
(installs into `.claude/skills`) or `antigravity` (installs into `.agent/skills`).

## License 📝

This project is licensed under the MIT License
