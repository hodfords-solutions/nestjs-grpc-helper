import { Property } from '../decorators/property.decorator';
import { IsEnum, IsString, Matches } from 'class-validator';

export class SortDto {
    @Property({ type: String })
    @IsString()
    @Matches(/^[a-zA-Z0-9]+$/, {
        message: 'Value must contain only letters and numbers, no spaces or special characters'
    })
    sortField: string;

    @Property({ type: String })
    @IsString()
    @IsEnum(['ASC', 'DESC'])
    sortDirection: number;
}
