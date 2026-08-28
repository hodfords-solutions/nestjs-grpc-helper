import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getPropertiesOfClass } from '../helpers/property.helper';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
    const buildDto = (data: object): PaginationDto => plainToInstance(PaginationDto, data);

    it('registers page and perPage as int32 numbers in the property storage', () => {
        const properties = getPropertiesOfClass(PaginationDto);
        const page = properties.find((property) => property.name === 'page');
        const perPage = properties.find((property) => property.name === 'perPage');

        expect(page.option).toMatchObject({ type: 'number', format: 'int32' });
        expect(perPage.option).toMatchObject({ type: 'number', format: 'int32' });
    });

    it('accepts numeric page and perPage values', async () => {
        const errors = await validate(buildDto({ page: 1, perPage: 10 }));

        expect(errors).toHaveLength(0);
    });

    it('rejects non-numeric values', async () => {
        const errors = await validate(buildDto({ page: 'one', perPage: 10 }));

        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('page');
        expect(Object.keys(errors[0].constraints)).toContain('isNumber');
    });

    it('rejects missing values', async () => {
        const errors = await validate(buildDto({}));

        expect(errors.map((error) => error.property).sort()).toEqual(['page', 'perPage']);
        for (const error of errors) {
            expect(Object.keys(error.constraints)).toContain('isNotEmpty');
        }
    });
});
