import { Property } from '../decorators/property.decorator.js';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class PaginationDto {
    @Property({ type: Number, format: 'int32' })
    @IsNotEmpty()
    @IsNumber()
    page: number;

    @Property({ type: Number, format: 'int32' })
    @IsNotEmpty()
    @IsNumber()
    perPage: number;
}
