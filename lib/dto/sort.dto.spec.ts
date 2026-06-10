import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getPropertiesOfClass } from '../helpers/property.helper';
import { SortDto } from './sort.dto';

describe('SortDto', () => {
    const buildDto = (data: object): SortDto => plainToInstance(SortDto, data);

    it('registers sortField and sortDirection as strings in the property storage', () => {
        const properties = getPropertiesOfClass(SortDto);
        const sortField = properties.find((property) => property.name === 'sortField');
        const sortDirection = properties.find((property) => property.name === 'sortDirection');

        expect(sortField.option).toMatchObject({ type: 'string' });
        expect(sortDirection.option).toMatchObject({ type: 'string' });
    });

    it('accepts an alphanumeric sort field with a valid direction', async () => {
        const errors = await validate(buildDto({ sortField: 'createdAt1', sortDirection: 'ASC' }));

        expect(errors).toHaveLength(0);
    });

    it('rejects sort fields containing spaces or special characters', async () => {
        const errors = await validate(buildDto({ sortField: 'created at!', sortDirection: 'DESC' }));

        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('sortField');
        expect(errors[0].constraints.matches).toBe(
            'Value must contain only letters and numbers, no spaces or special characters'
        );
    });

    it('rejects sort directions other than ASC and DESC', async () => {
        const errors = await validate(buildDto({ sortField: 'name', sortDirection: 'UP' }));

        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('sortDirection');
        expect(Object.keys(errors[0].constraints)).toContain('isEnum');
    });
});
