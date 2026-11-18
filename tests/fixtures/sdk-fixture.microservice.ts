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

// `SELF` becomes the Rust variant `Self`, a keyword that cannot be a raw identifier: it is emitted as `Self_`
export enum FixtureScopeEnum {
    SELF = 'self',
    TEAM = 'team'
}

// protoc-gen-go upper-cases a letter that follows a digit: this message is `pb.I18NTextDto` in Go
export class I18nTextDto {
    @Property({ type: String })
    text: string;

    @Property({ type: String, enum: FixtureScopeEnum, enumName: 'FixtureScopeEnum', required: false })
    scope?: FixtureScopeEnum;
}

export class FixtureItemResponse {
    @Property({ type: String })
    id: string;

    @Property({ type: String, enum: FixtureStatusEnum, enumName: 'FixtureStatusEnum', required: false })
    status?: FixtureStatusEnum;

    @Property({ type: Number, format: 'int32' })
    total: number;

    // Array-form enum: '1st' does not start with a letter, so its Rust variant / Go constant get a `V` prefix
    @Property({ type: String, enum: ['ADMIN', 'STANDARD', '1st'], enumName: 'FixtureRoleEnum', required: false })
    role?: string;

    // Function-form enum resolving to no values: omitted from the Rust / Go enums
    @Property({ type: String, enum: () => [], enumName: 'FixtureEmptyEnum', required: false })
    legacyCode?: string;

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

    // Rust keywords: tonic names these client methods `r#move` and `r#type`
    @GrpcAction('Move a text')
    @ResponseModel(I18nTextDto)
    move(@GrpcValue() text: I18nTextDto): any {
        return text;
    }

    @GrpcAction('No parameters, named after a Rust keyword')
    type(): void {}

    // Go names with a digit before a lowercase letter: `Enable2Fa` and `B2BCustomers`
    @GrpcAction('Enable two-factor authentication')
    enable2fa(): void {}

    @GrpcAction('List business customers')
    @ResponseModel(I18nTextDto, true)
    b2bCustomers(@GrpcValue() query: FixtureQueryDto): any {
        return [query];
    }

    @GrpcAction('Get the workspace of the caller')
    @ResponseModel(String)
    getWorkspace(@GrpcMetadataId('workspace-id') workspaceId: string): any {
        return workspaceId;
    }
}
