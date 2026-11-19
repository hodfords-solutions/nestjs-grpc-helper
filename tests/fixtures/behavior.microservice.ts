import 'reflect-metadata';
// Register the Native*Value response classes exactly like importing the library index does in production
import '../../lib/responses/native.response.js';
import { BadRequestException, Controller, Module, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { GrpcExceptionFilter } from '@hodfords/nestjs-exception';
import { ResponseModel, ResponseModule } from '@hodfords/nestjs-response';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { concat, interval, map, Observable, take, throwError } from 'rxjs';
import { GrpcMetadataId } from '../../lib/decorators/grpc-metadata.decorator.js';
import { GrpcValue } from '../../lib/decorators/grpc-value.decorator.js';
import { GrpcAction, GrpcStreamAction, RegisterGrpcMicroservice } from '../../lib/decorators/microservice.decorator.js';
import { Property } from '../../lib/decorators/property.decorator.js';

export enum BehaviorKindEnum {
    BASIC = 'basic',
    PREMIUM = 'premium'
}

export class BehaviorItemResponse {
    @Property({ type: String })
    @IsString()
    name: string;

    @Property({ type: Number, format: 'int32' })
    @IsInt()
    index: number;

    @Property({ type: Number, format: 'double' })
    @IsNumber()
    price: number;

    @Property({ type: String, enum: BehaviorKindEnum, enumName: 'BehaviorKindEnum' })
    @IsEnum(BehaviorKindEnum)
    kind: BehaviorKindEnum;

    @Property({ type: String, required: false })
    @IsString()
    @IsOptional()
    payload?: string;
}

export class BehaviorQueryDto {
    @Property({ type: String })
    @IsString()
    name: string;

    @Property({ type: Number, format: 'int32', required: false })
    @IsInt()
    @Min(0)
    @IsOptional()
    count?: number;

    @Property({ type: Number, format: 'int32', required: false, description: 'Delay before answering' })
    @IsInt()
    @IsOptional()
    delayMs?: number;

    @Property({ type: Number, format: 'int32', required: false, description: 'Size of the payload of each item' })
    @IsInt()
    @IsOptional()
    payloadBytes?: number;
}

function buildItem(query: BehaviorQueryDto, index: number): BehaviorItemResponse {
    return {
        name: query.name,
        index,
        price: 1.5 + index,
        kind: index % 2 ? BehaviorKindEnum.PREMIUM : BehaviorKindEnum.BASIC,
        payload: 'x'.repeat(query.payloadBytes || 0)
    };
}

/**
 * A microservice with real behavior, served over gRPC by tests/sdk-behavior.spec.ts and called by the
 * Go and Rust programs in tests/consumers. The name "missing" selects the "no value" branch of every
 * nullable rpc.
 *
 * No @UseResponseInterceptor() here: the spec runs a pure microservice, where the interceptor that
 * ResponseModule.forRoot() registers globally already applies. (A hybrid HTTP + gRPC app needs the
 * decorator, because global interceptors do not reach its connected microservice.)
 */
@Controller()
@RegisterGrpcMicroservice('Behavior service called by the Go and Rust consumers')
@UseFilters(GrpcExceptionFilter)
@UsePipes(new ValidationPipe())
export class BehaviorMicroservice {
    @GrpcAction('Find one item')
    @ResponseModel(BehaviorItemResponse)
    findOne(@GrpcValue() query: BehaviorQueryDto): BehaviorItemResponse {
        return buildItem(query, 0);
    }

    @GrpcAction('Find `count` items, after `delayMs`')
    @ResponseModel(BehaviorItemResponse, true)
    async findMany(@GrpcValue() query: BehaviorQueryDto): Promise<BehaviorItemResponse[]> {
        if (query.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, query.delayMs));
        }
        return Array.from({ length: query.count || 0 }, (_, index) => buildItem(query, index));
    }

    @GrpcAction('Greet by name')
    @ResponseModel(String)
    getName(@GrpcValue() query: BehaviorQueryDto): string {
        return `hello ${query.name}`;
    }

    @GrpcAction('Echo the count')
    @ResponseModel(Number)
    countItems(@GrpcValue() query: BehaviorQueryDto): number {
        return query.count || 0;
    }

    @GrpcAction('False for the name "inactive"')
    @ResponseModel(Boolean)
    isActive(@GrpcValue() query: BehaviorQueryDto): boolean {
        return query.name !== 'inactive';
    }

    @GrpcAction('List `count` tags')
    @ResponseModel(String, true)
    getTags(@GrpcValue() query: BehaviorQueryDto): string[] {
        return Array.from({ length: query.count || 0 }, (_, index) => `tag-${index}`);
    }

    @GrpcAction('Find one item or nothing')
    @ResponseModel(BehaviorItemResponse, { isAllowEmpty: true })
    maybeFindOne(@GrpcValue() query: BehaviorQueryDto): BehaviorItemResponse | null {
        return query.name === 'missing' ? null : buildItem(query, 0);
    }

    @GrpcAction('Greet by name or nothing')
    @ResponseModel(String, false, true)
    maybeGetName(@GrpcValue() query: BehaviorQueryDto): string | null {
        return query.name === 'missing' ? null : `hello ${query.name}`;
    }

    @GrpcAction('Activity flag or nothing')
    @ResponseModel(Boolean, false, true)
    maybeIsActive(@GrpcValue() query: BehaviorQueryDto): boolean | null {
        return query.name === 'missing' ? null : query.name !== 'inactive';
    }

    @GrpcAction('Echo the count or nothing')
    @ResponseModel(Number, false, true)
    maybeCount(@GrpcValue() query: BehaviorQueryDto): number | null {
        return query.name === 'missing' ? null : query.count || 0;
    }

    @GrpcAction('No parameters and no response')
    ping(): void {}

    @GrpcAction('Always fails with a business error')
    @ResponseModel(String)
    fail(@GrpcValue() query: BehaviorQueryDto): string {
        throw new BadRequestException(`cannot process ${query.name}`);
    }

    @GrpcAction('Echo the workspace id read from the metadata')
    @ResponseModel(String)
    getWorkspace(@GrpcMetadataId('workspace-id') workspaceId: string): string {
        return workspaceId;
    }

    @GrpcStreamAction('Emit `count` items; "endless" never ends, "fail" errors after two items')
    @ResponseModel(BehaviorItemResponse)
    watchItems(@GrpcValue() query: BehaviorQueryDto): Observable<BehaviorItemResponse> {
        const items = interval(10).pipe(map((index) => buildItem(query, index)));
        if (query.name === 'endless') {
            return items;
        }
        if (query.name === 'fail') {
            return concat(
                items.pipe(take(2)),
                throwError(() => new BadRequestException('stream failed'))
            );
        }
        return items.pipe(take(query.count || 0));
    }
}

@Module({ imports: [ResponseModule.forRoot()], controllers: [BehaviorMicroservice] })
export class BehaviorModule {}
