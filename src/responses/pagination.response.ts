import { IsNumber } from 'class-validator';
import { Property } from '@hodfords/nestjs-grpc-helper';
import { MockMethod, MockSample } from '../../libs/decorators/mock.decorator';

export abstract class PaginationResponse {
    abstract items: any[];

    @Property({ type: 'int32' })
    @MockMethod('faker.datatype.number', [5, 10])
    @IsNumber()
    total: number;

    @Property({ type: 'int32' })
    @MockMethod('faker.datatype.number', [5, 10])
    @IsNumber()
    lastPage: number;

    @Property({ type: 'int32' })
    @MockMethod('faker.datatype.number', [5, 10])
    @IsNumber()
    perPage: number;

    @Property({ type: 'int32' })
    @MockSample(1)
    @IsNumber()
    currentPage: number;
}
