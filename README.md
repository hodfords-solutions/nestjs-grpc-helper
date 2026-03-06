<p align="center">
  <a href="http://opensource.hodfords.uk" target="blank"><img src="https://opensource.hodfords.uk/img/logo.svg" width="320" alt="Hodfords Logo" /></a>
</p>

<p align="center">
<b>nestjs-grpc-helper</b> simplifies gRPC integration in NestJS, allowing seamless communication between services. It enables easy setup of gRPC clients and servers, and supports building SDK packages that any service can import and use, ensuring consistent API interaction across your microservices architecture.
</p>

## Installation 🤖

Install the `nestjs-grpc-helper` package with:

```bash
npm install @hodfords/nestjs-grpc-helper --save
```

Next, automatically generate the proto file and include it in main.ts before starting the application:

```typescript
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';

generateProtoService(camelCase(env.APP_NAME), env.ROOT_PATH + '/../');
```

## Usage 🚀

### Creating Microservices

Create microservices using the `@RegisterGrpcMicroservice` decorator, similar to how you would use a Controller. Ensure that the response adheres to the [nestjs-response](https://www.npmjs.com/package/@hodfords/nestjs-response) rules:

```typescript
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

### Decorators

#### Service & Method Decorators

| Decorator                                  | Description                                                       |
|--------------------------------------------|-------------------------------------------------------------------|
| `@RegisterGrpcMicroservice(description?)` | Marks a class as a gRPC microservice                               |
| `@GrpcAction(description?)`               | Marks a method as a gRPC action/endpoint                           |

#### Request Parameter Decorators

| Decorator              | Description                                                                   |
|------------------------|-------------------------------------------------------------------------------|
| `@GrpcValue()`         | Marks a parameter as the main request body (used with DTO types)              |
| `@GrpcParam(option)`   | Defines a direct request parameter with type, name, and validation            |
| `@GrpcId(name)`        | Shortcut for a UUID string parameter (includes `IsNotEmpty` + `IsUUID`)       |
| `@GrpcIds(name)`       | Shortcut for an array of UUID string parameters                               |
| `@GrpcEnum(option)`    | Defines an enum parameter with automatic validation                           |
| `@GrpcEnums(option)`   | Defines an array of enum parameters                                           |
| `@GrpcPagination()`    | Built-in pagination parameter (`page`, `perPage`)                             |
| `@GrpcSort()`          | Built-in sort parameter (`sortField`, `sortDirection`)                        |
| `@SdkFlattenParams()`  | Flattens nested DTO properties into individual parameters in the generated SDK |

#### Metadata Decorators

| Decorator                    | Description                                        |
|------------------------------|----------------------------------------------------|
| `@GrpcMetadata(option)`      | Extracts values from gRPC metadata (like headers)  |
| `@GrpcMetadataId(name)`      | Shortcut for UUID metadata fields                  |

#### Property & Type Decorators

| Decorator                   | Description                                                         |
|-----------------------------|---------------------------------------------------------------------|
| `@Property(option)`          | Defines DTO/response properties with type, validation, and metadata |
| `@AnyType({ isDto? })`      | Handles JSON serialization for dynamic `any` typed properties       |
| `@ExtendType()`              | Preserves property metadata for composed types                      |

**Example using `@Property` and `@AnyType`:**

```typescript
@Property({ type: String, format: 'any', required: false })
@AnyType()
data: any;
```

### Type Helpers

Compose DTOs while preserving property metadata for proto generation and SDK creation:

```typescript
// Pick only specific properties
export class UserSummary extends PickResponseType(UserResponse, ['id', 'name']) {}

// Omit specific properties
export class UserWithoutEmail extends OmitResponseType(UserResponse, ['email']) {}

// Make all properties optional
export class UpdateUserDto extends PartialResponseType(UserResponse) {}

// Combine multiple types
export class FullUser extends IntersectionResponseType(UserResponse, ProfileResponse) {}
```

### Mock Response

To effectively generate and handle mock data in your application, you can use the `@MockMethod`, `@MockSample`, and `@MockNested` decorators.

##### Generate dynamic data with `@MockMethod`

Use `@MockMethod` to apply Faker methods for generating random values.

For example, to create a random string of 10 characters

```typescript
@Property({ type: String, required: false })
@MockMethod('faker.datatype.string', [10])
@IsString()
name: string;
```

##### Set fixed values with `@MockSample`

If you need to set a fixed value for a property, use the `@MockSample` decorator. This is useful for enumerations or other predefined values.

For example, to set a fixed user type

```typescript
@Property({
    type: String,
    enum: UserTypeEnum,
    enumName: 'UserTypeEnum'
})
@MockSample(UserTypeEnum.STANDARD)
@IsEnum(UserTypeEnum)
type: UserTypeEnum;
```

##### Generate nested data

Use `@MockNested` to generate mock data for nested objects or arrays of nested objects.

For example, to create an array of 5 nested objects

```typescript
@Property({ type: UserResponse, isArray: true })
@IsArray()
@ValidateNested()
@Type(() => UserResponse)
@MockNested(5)
users: UserResponse[];
```

##### Generate mock instances programmatically

```typescript
import { sample } from '@hodfords/nestjs-grpc-helper';

const mockUser = sample(UserResponse);
```

### Create SDK

To generate a TypeScript SDK for your gRPC services, you can use the `make-sdk` command. This command will automatically generate the necessary proto files and package them into a JavaScript SDK.
You also need the following configuration in your sdk-config.json file:

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
  "tsconfig": {
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "outDir": "sdkBuild"
    },
    "include": ["sdk"]
  }
}
```

Details of the configuration:

| Field               | Description                                           |
|---------------------|-------------------------------------------------------|
| name                | Name of the SDK                                       |
| packageName         | Name of the package                                   |
| format              | Format the generated code                             |
| build               | Build the generated code                              |
| output              | Output directory for the generated code               |
| outputBuild         | Output directory for the built code                   |
| removeOutput        | Remove the output directory                           |
| addAllowDecorator   | Add the allow decorator, need class-validator package  |
| tsconfig            | TypeScript configuration                              |
| aiSkill             | AI skill configuration (optional)                     |
| aiSkill.name        | Name of the AI skill                                  |
| aiSkill.description | Description of the AI skill                           |

When `aiSkill` is configured, the SDK build will generate a `SKILL.md` file and a `skill.json` metadata file in the output directory. These files describe your gRPC services, models, and enums in a format that AI agents can consume.

To generate the SDK, run the following command:
```shell
npm run wz-command make-sdk
```

#### What this command does

This command will:

1. **Collect all request and response types**: It gathers all `@GrpcValue` request and response types from your project.
2. **Generate proto file**: Automatically generates the necessary proto files based on the collected types.
3. **Create JavaScript Package**: Packages the generated code into a JavaScript SDK. The SDK will be published using the name and version specified in your package.json, making it available for other services to import and use. The arguments, response structure, and method names remain consistent with the definitions in your gRPC service, ensuring seamless integration and functionality across services.

### SDK Usage

After publishing the SDK, other services can easily integrate it. Here's an example of how to use the generated SDK:

1. **Import the SDK package**

2. **Register the microservice module**: Configure the microservice in `AppModule` with the appropriate gRPC URL and timeout settings.

    ```typescript
    UserModule.register({
        url: env.GRPC_URL,
        timeout: 5000
    });
    ```

3. **Use the SDK in another service**: Import the SDK and use it to interact with your gRPC services.

    ```typescript
    export class OtherService {
        constructor(private userMicroservice: UserMicroservice) {}

        async doTask(userId: string): Promise<void> {
            const user = await this.userMicroservice.findUserById({ id: userId });
            // Process user information as needed
        }
    }
    ```

In this example, `OtherService` uses the `UserMicroservice` class from the SDK to call the `findUserById` method.

### Custom gRPC Client

The library provides `CustomGrpcClient`, an extended `ClientGrpcProxy` with additional features:

```typescript
import { CustomGrpcClient } from '@hodfords/nestjs-grpc-helper';

{
    customClass: CustomGrpcClient,
    options: {
        maxSendMessageLength: 1024 * 1024 * 50,       // 50MB max outgoing message
        maxReceiveMessageLength: 1024 * 1024 * 50,     // 50MB max incoming message
        keepaliveTimeMs: 120000,                        // Keepalive ping interval
        keepaliveTimeoutMs: 20000,                      // Keepalive timeout
        keepalivePermitWithoutCalls: 1                  // Allow pings without active calls
    }
}
```

### AI Agent Skill

After publishing the SDK, you can copy the generated AI skill files into your project for AI agents (e.g., Claude, Antigravity) to use. Run the `update-ai-skill` command with a package name pattern and the target AI:

```shell
npm run wz-command update-ai-skill "@hodfords/*" claude
```

This copies the `SKILL.md` files from matching packages in `node_modules` into the appropriate AI skills directory (`.claude/skills` for Claude, `.agent/skills` for Antigravity).

### Document for gRPC

The library includes an interactive documentation UI for browsing and testing your gRPC services. Access it at `http://your-host/microservice-documents`.

```typescript
MicroserviceDocumentModule.register({
    isEnable: true,
    prefix: <app-prefix>,
    packageName: camelCase(<package-name>),
    clientOptions: { ...microserviceGrpcConfig, customClass: CustomGrpcClient, transport: undefined }
})
```

### Translation Support

Use the `GrpcTranslationInterceptor` to extract language settings from gRPC metadata for i18n support:

```typescript
@UseInterceptors(GrpcTranslationInterceptor)
@GrpcAction('Get user')
@ResponseModel(UserResponse)
getUser(@GrpcValue() dto: GetUserDto): Promise<UserEntity> {
    return this.userService.getUser(dto.id);
}
```

## License 📝

This project is licensed under the MIT License
