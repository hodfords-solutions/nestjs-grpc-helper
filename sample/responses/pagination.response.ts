import { IsNumber } from 'class-validator';
import { MockMethod, MockSample, Property } from '@hodfords/nestjs-grpc-helper';

export abstract class PaginationResponse {
    abstract items: any[];

    @Property({ type: String, format: 'int32' })
    @MockMethod('faker.number.int', [5, 10])
    @IsNumber()
    total: number;

    @Property({ type: String, format: 'int32' })
    @MockMethod('faker.number.int', [5, 10])
    @IsNumber()
    lastPage: number;

    @Property({ type: String, format: 'int32' })
    @MockMethod('faker.number.int', [5, 10])
    @IsNumber()
    perPage: number;

    @Property({ type: String, format: 'int32' })
    @MockSample(1)
    @IsNumber()
    currentPage: number;
}
