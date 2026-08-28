---
name: nestjs-grpc-helper
description: How to build gRPC microservices, DTOs, responses, SDKs, and documentation with the @hodfords/nestjs-grpc-helper library. Use this skill whenever the user is working with gRPC in a NestJS project, creating microservice endpoints, defining protobuf-compatible DTOs, generating gRPC SDKs, setting up gRPC documentation, configuring gRPC clients, or composing response types. Also use it when the user mentions decorators like @RegisterGrpcMicroservice, @GrpcAction, @GrpcValue, @Property, @MockMethod, or any gRPC-related NestJS patterns — even if they don't explicitly name this library.
---

# nestjs-grpc-helper

A NestJS library that simplifies gRPC integration through decorators and automatic code generation. It turns decorated TypeScript classes into `.proto` files, generates type-safe SDK packages, and provides an interactive documentation UI — all driven by metadata collected at runtime.

## Core Concept: Decorator -> Metadata -> Code Generation

The library uses a metadata-driven pipeline:
1. **Decorators** attach metadata to classes, methods, and parameters via `reflect-metadata`
2. **Storages** collect this metadata at runtime
3. **Services** consume metadata to generate `.proto` files, SDK packages, and documentation

Everything starts from the decorators — get them right, and the rest is automatic.

## Creating a gRPC Microservice

A microservice class is like a NestJS controller but for gRPC. Always apply `@Controller()` alongside `@RegisterGrpcMicroservice()`.

```typescript
import { Controller, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { ResponseModel, UseResponseInterceptor } from '@hodfords/nestjs-response';
import {
    RegisterGrpcMicroservice,
    GrpcAction,
    GrpcValue,
    GrpcId,
    GrpcIds,
    GrpcEnum,
    GrpcPagination,
    GrpcSort,
    GrpcMetadataId,
    SdkFlattenParams
} from '@hodfords/nestjs-grpc-helper';

@Controller()
@RegisterGrpcMicroservice('User management microservice')
@UseFilters(GrpcExceptionFilter)
@UsePipes(new ValidationPipe())
@UseResponseInterceptor()
export class UserMicroservice {
    constructor(private userService: UserService) {}

    // Basic method: DTO in, response out
    @GrpcAction('Find user by search criteria')
    @ResponseModel(UserResponse)
    findUser(@GrpcValue() dto: FindUserDto): Promise<UserResponse> {
        return this.userService.findUser(dto);
    }

    // Return an array
    @GrpcAction('List all users')
    @ResponseModel(UserResponse, true)
    listUsers(@GrpcValue() dto: ListUsersDto): Promise<UserResponse[]> {
        return this.userService.listUsers(dto);
    }

    // Nullable response (can return null)
    @GrpcAction('Find user or null')
    @ResponseModel(UserResponse, { isAllowEmpty: true })
    findUserOrNull(@GrpcValue() dto: FindUserDto): Promise<UserResponse | null> {
        return this.userService.findUserOrNull(dto);
    }

    // Primitive return types
    @GrpcAction('Check if user is active')
    @ResponseModel(Boolean)
    isUserActive(@GrpcValue() dto: GetUserDto): Promise<boolean> {
        return this.userService.isActive(dto.id);
    }

    @GrpcAction('Count users')
    @ResponseModel(Number)
    countUsers(@GrpcValue() dto: FilterDto): Promise<number> {
        return this.userService.count(dto);
    }

    @GrpcAction('Get display name')
    @ResponseModel(String)
    getDisplayName(@GrpcValue() dto: GetUserDto): Promise<string> {
        return this.userService.getDisplayName(dto.id);
    }

    // Return arrays of primitives
    @GrpcAction('Get user tags')
    @ResponseModel(String, true)
    getUserTags(@GrpcValue() dto: GetUserDto): Promise<string[]> {
        return this.userService.getTags(dto.id);
    }

    // Individual parameters instead of a DTO body
    @GrpcAction('Get user by ID')
    @ResponseModel(UserResponse)
    getUserById(@GrpcId('userId') userId: string): Promise<UserResponse> {
        return this.userService.findById(userId);
    }

    // Multiple individual parameters
    @GrpcAction('Get user by ID and type')
    @ResponseModel(UserResponse)
    getUserByType(
        @GrpcId('userId') userId: string,
        @GrpcEnum({ name: 'userType', enum: UserTypeEnum, enumName: 'UserTypeEnum' }) userType: UserTypeEnum
    ): Promise<UserResponse> {
        return this.userService.findByType(userId, userType);
    }

    // Pagination and sorting (built-in DTOs)
    @GrpcAction('List users with pagination')
    @ResponseModel(UserPaginationResponse)
    listUsersPaginated(
        @GrpcValue() dto: FilterDto,
        @GrpcPagination() pagination: PaginationDto,
        @GrpcSort() sort: SortDto
    ): Promise<UserPaginationResponse> {
        return this.userService.listPaginated(dto, pagination, sort);
    }

    // Access gRPC metadata (like request headers)
    @GrpcAction('Get workspace users')
    @ResponseModel(UserResponse, true)
    getWorkspaceUsers(
        @GrpcValue() dto: FilterDto,
        @GrpcMetadataId('workspace-id') workspaceId: string
    ): Promise<UserResponse[]> {
        return this.userService.listByWorkspace(workspaceId, dto);
    }

    // Flatten params: SDK will expose individual fields instead of a single DTO object
    @GrpcAction('Search users flattened')
    @SdkFlattenParams()
    @ResponseModel(UserResponse, true)
    searchUsersFlattened(@GrpcValue() dto: SearchDto): Promise<UserResponse[]> {
        return this.userService.search(dto);
    }
}
```

## Defining DTOs and Response Models

Every DTO and response property must have the `@Property()` decorator for proto generation to work. Without it, the field won't appear in the generated `.proto` file or SDK.

### Basic DTO

```typescript
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Property, AnyType } from '@hodfords/nestjs-grpc-helper';

export class FindUserDto {
    @Property({ type: String, description: 'User name to search' })
    @IsString()
    name: string;

    @Property({ type: String, required: false })
    @IsString()
    @IsOptional()
    email?: string;
}
```

### Nested DTOs

```typescript
export class AddressDto {
    @Property({ type: String })
    @IsString()
    street: string;

    @Property({ type: String, required: false })
    @IsString()
    @IsOptional()
    city?: string;
}

export class CreateUserDto {
    @Property({ type: String })
    @IsString()
    name: string;

    // Single nested object
    @Property({ type: AddressDto })
    address: AddressDto;

    // Array of nested objects
    @Property({ type: AddressDto, isArray: true })
    previousAddresses: AddressDto[];
}
```

### Enum Properties

```typescript
export enum UserTypeEnum {
    ADMIN = 'ADMIN',
    STANDARD = 'STANDARD',
}

export class UserResponse {
    @Property({ type: String, required: false })
    name?: string;

    @Property({
        type: String,
        enum: UserTypeEnum,
        enumName: 'UserTypeEnum',
        required: false
    })
    @IsEnum(UserTypeEnum)
    @IsOptional()
    type?: UserTypeEnum;
}
```

### Any Type (JSON passthrough)

When a field can hold arbitrary data, use `@AnyType()`. The value is serialized as JSON over the wire, so it's less efficient than binary protobuf — use sparingly.

```typescript
export class FlexibleDto {
    @Property({ type: String, format: 'any', required: false })
    @AnyType()
    data: any;

    // For DTOs that need deserialization on the receiving end
    @Property({ type: String, format: 'any' })
    @AnyType({ isDto: true })
    payload: any;
}
```

## Type Helpers (Composing DTOs)

Reuse existing types by picking, omitting, or combining properties. These preserve all `@Property()` metadata so proto generation works correctly.

```typescript
import {
    PickResponseType,
    OmitResponseType,
    PartialResponseType,
    IntersectionResponseType
} from '@hodfords/nestjs-grpc-helper';

// Only include specific fields
export class UserSummary extends PickResponseType(UserResponse, ['name', 'type']) {}

// Exclude specific fields
export class UserWithoutAdmin extends OmitResponseType(UserResponse, ['isAdmin']) {}

// Make all fields optional
export class UpdateUserDto extends PartialResponseType(UserResponse) {}

// Merge multiple types
export class FullProfile extends IntersectionResponseType(UserResponse, AddressResponse) {}
```

## Mock Data Decorators

Attach mock generation instructions to response properties for testing and documentation.

```typescript
import { Property, MockMethod, MockSample, MockNested } from '@hodfords/nestjs-grpc-helper';

export class UserResponse {
    // Dynamic mock via Faker.js
    @Property({ type: String })
    @MockMethod('faker.person.firstName')
    name: string;

    // Fixed sample value
    @Property({ type: String, enum: UserTypeEnum, enumName: 'UserTypeEnum' })
    @MockSample(UserTypeEnum.STANDARD)
    type: UserTypeEnum;

    // Nested array of mocks (generates 3 items)
    @Property({ type: AddressResponse, isArray: true })
    @MockNested(3)
    addresses: AddressResponse[];
}
```

Method-level mock decorators for response data:

```typescript
@GrpcAction('Check active')
@ResponseModel(Boolean)
@MockResponseSample(true)
checkActive(@GrpcValue() dto: GetUserDto): any { ... }

@GrpcAction('Get name')
@ResponseModel(String)
@MockResponseMethod('faker.person.fullName')
getName(@GrpcValue() dto: GetUserDto): any { ... }
```

Generate mock instances programmatically:

```typescript
import { sample } from '@hodfords/nestjs-grpc-helper';

const mockUser = sample(UserResponse); // Full mock with nested data
```

## Proto Generation

Generate the `.proto` file in `main.ts` before the app starts:

```typescript
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';
import camelCase from 'lodash/camelCase';

generateProtoService(camelCase(env.APP_NAME), env.ROOT_PATH + '/../');
```

## SDK Generation

### Configuration (sdk-config.json)

```json
{
    "name": "userService",
    "packageName": "@myorg/user-service-sdk",
    "format": true,
    "build": true,
    "output": "sdk",
    "outputBuild": "sdkBuild",
    "removeOutput": true,
    "addAllowDecorator": true,
    "tsconfig": {
        "extends": "./tsconfig.json",
        "compilerOptions": { "outDir": "sdkBuild" },
        "include": ["sdk"]
    },
    "aiSkill": {
        "name": "user-service",
        "description": "User management gRPC service SDK"
    }
}
```

### Generate

```shell
npm run wz-command make-sdk
```

This collects all decorated types, generates `.proto` files, and creates a complete TypeScript SDK package with services, modules, models, enums, and mock providers.

When `aiSkill` is configured, it also generates `SKILL.md` and `skill.json` for AI agent consumption.

### Using the Generated SDK

In the consuming service:

```typescript
// 1. Register the module
import { UserServiceModule } from '@myorg/user-service-sdk';

@Module({
    imports: [
        UserServiceModule.register({
            url: 'localhost:50051',
            timeout: 5000
        })
    ]
})
export class AppModule {}

// 2. Inject and call
@Injectable()
export class OrderService {
    constructor(private userMicroservice: UserMicroservice) {}

    async getOrderUser(userId: string): Promise<UserResponse> {
        return this.userMicroservice.findUser({ name: userId });
    }
}
```

## Custom gRPC Client

`CustomGrpcClient` extends NestJS `ClientGrpcProxy` with service caching and full channel options:

```typescript
import { CustomGrpcClient } from '@hodfords/nestjs-grpc-helper';

// In module registration or microservice config
{
    customClass: CustomGrpcClient,
    options: {
        maxSendMessageLength: 1024 * 1024 * 50,
        maxReceiveMessageLength: 1024 * 1024 * 50,
        keepaliveTimeMs: 120000,
        keepaliveTimeoutMs: 20000,
        keepalivePermitWithoutCalls: 1
    }
}
```

## Documentation UI

Serve an interactive documentation UI for browsing and testing gRPC services:

```typescript
import { MicroserviceDocumentModule } from '@hodfords/nestjs-grpc-helper';

@Module({
    imports: [
        MicroserviceDocumentModule.register({
            isEnable: true,
            prefix: 'api',
            packageName: camelCase('my-service'),
            clientOptions: {
                ...microserviceGrpcConfig,
                customClass: CustomGrpcClient,
                transport: undefined
            }
        })
    ]
})
export class AppModule {}
```

Access at `http://your-host/microservice-documents`.

## AI Agent Skills

Copy generated AI skill files from published SDK packages into your project:

```shell
npm run wz-command update-ai-skill "@myorg/*" claude
```

This copies `SKILL.md` files into `.claude/skills` (for Claude) or `.agent/skills` (for Antigravity).

## Translation Interceptor

Extract language from gRPC metadata for i18n support:

```typescript
import { GrpcTranslationInterceptor } from '@hodfords/nestjs-grpc-helper';

@UseInterceptors(GrpcTranslationInterceptor)
@GrpcAction('Get user')
@ResponseModel(UserResponse)
getUser(@GrpcValue() dto: GetUserDto): Promise<UserResponse> { ... }
```

## Key Rules

- Every DTO/response property needs `@Property()` — without it, the field is invisible to proto generation
- Always pair `@Controller()` with `@RegisterGrpcMicroservice()` on microservice classes
- Use `@ResponseModel(Type)` to declare the return type for SDK and proto generation
- For arrays, use `@ResponseModel(Type, true)`; for nullable, use `@ResponseModel(Type, { isAllowEmpty: true })`
- Enum properties need both `enum` and `enumName` in `@Property()` options
- `@GrpcValue()` is for the full request body DTO; `@GrpcId()`, `@GrpcEnum()`, etc. are for individual parameters
- `@AnyType()` fields use JSON serialization — prefer typed properties for better performance
- Type helpers (`PickResponseType`, `OmitResponseType`, etc.) preserve metadata for code generation
