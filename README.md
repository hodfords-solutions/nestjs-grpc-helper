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
```

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
| `format`            | Refines numbers (`'int32'`, `'float'`, …) or marks a string as dynamic JSON (`'any'`)       |
| `enum` / `enumName` | Declares an enum field; `enumName` names the generated enum                                 |

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
