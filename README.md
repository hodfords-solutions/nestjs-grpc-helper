# nestjs-grpc-helper

## Preinstall
https://docs.nestjs.com/microservices/grpc

```
npm i --save @grpc/grpc-js @grpc/proto-loader
```

## Installation 🤖

```
npm install @hodfords/nestjs-grpc-helper --save
```

Automatically generate proto file, add it to main.ts, before application starts.
```typescript
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';

generateProtoService(camelCase(env.APP_NAME), env.ROOT_PATH + '/../');
```

Create microservices, it works similar to Controller.
Response must be defined according to the rules of nestjs-response.

```typescript
@GrpcMicroservice()
export class UserMicroservice {
    constructor(private userService: UserService) {
    }

    @GrpcAction('Get user by id')
    @ResponseModel(UserResponse)
    findUserById(@GrpcValue() dto: GetUserByIdDto): Promise<UserEntity> {
        return this.userService.findUserById(dto.userId);
    }
}
```

### Mock response

Use faker as a method: `MockMethod`
```typescript
@Property({ type: String, required: false })
@MockMethod('faker.datatype.string', [10])
@IsString()
name: string;
```

Use fixed values: `MockSample`
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

Specifies the number of elements to return: `MockNested`
```typescript
@Property({ type: UserResponse, isArray: true })
@IsArray()
@ValidateNested()
@Type(() => UserResponse)
@MockNested(5)
users: UserResponse[];
```

## Create SDK

Run this command to create the typescript sdk
```shell
npm run wz-command make-sdk <package-name> <folder>
```

## Document for GRPC
You can go to `http://xyz/microservice-documents` to check and try to call the grpc method

```typescript
MicroserviceDocumentModule.register({
    isEnable: true,
    prefix: <app-prefix>,
    packageName: camelCase(<package-name>>),
    clientOptions: { ...microserviceGrpcConfig, customClass: CustomGrpcClient, transport: undefined }
})
```
