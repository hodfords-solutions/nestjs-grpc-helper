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

### Creating microservices

Create microservices using the `@GrpcMicroservice` decorator, similar to how you would use a Controller. Ensure that the response adheres to the [nestjs-response](https://www.npmjs.com/package/@hodfords/nestjs-response) rules:

```typescript
@GrpcMicroservice()
export class UserMicroservice {
    constructor(private userService: UserService) {}

    @GrpcAction('Get user by id')
    @ResponseModel(UserResponse)
    findUserById(@GrpcValue() dto: GetUserByIdDto): Promise<UserEntity> {
        return this.userService.findUserById(dto.userId);
    }
}
```

### Any Type

You can use any type if fixed types are not an option. However, since it’s passed as JSON, the performance may not be as optimal as with binary. Consider using binary if performance is a concern.

```typescript
@Property({ type: 'any', required: false })
@AnyType()
data: any;
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

| Field             | Description                                           |
|-------------------|-------------------------------------------------------|
| name              | Name of the SDK                                       |
| packageName       | Name of the package                                   |
| format            | Format the generated code                             |
| build             | Build the generated code                              |
| output            | Output directory for the generated code               |
| outputBuild       | Output directory for the built code                   |
| removeOutput      | Remove the output directory                           |
| addAllowDecorator | Add the allow decorator, need class-validator package |
| tsconfig          | TypeScript configuration                              |


To generate the SDK, run the following command:
```shell
npm run wz-command make-sdk
```

#### What this command does

This command will:

1. **Collect all request and response types**: It gathers all `@GrpcValue` request and response types from your project.
2. **Generate proto file**: Automatically generates the necessary proto files based on the collected types.
3. **Create JavaScript Package**: Packages the generated code into a JavaScript SDK. The SDK will be published using the name and version specified in your package.json, making it available for other services to import and use. The arguments, response structure, and method names remain consistent with the definitions in your gRPC service, ensuring seamless integration and functionality across services.

### SDK usage

After publishing the SDK, other services can easily integrate it. Here’s an example of how to use the generated SDK

1. **Import the sdk package**

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

### Mock response

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

### Document for GRPC

You can go to `http://xyz/microservice-documents` to check and try to call the gRPC method

```typescript
MicroserviceDocumentModule.register({
    isEnable: true,
    prefix: <app-prefix>,
    packageName: camelCase(<package-name>),
    clientOptions: { ...microserviceGrpcConfig, customClass: CustomGrpcClient, transport: undefined }
})
```

## License 📝

This project is licensed under the MIT License
