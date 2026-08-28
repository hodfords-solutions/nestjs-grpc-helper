/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import { SdkExpose } from './sdk-expose.decorator';
import { propertyStorage, sdkDtos, sdkExposedClasses } from '../storages/property.storage';

describe('SdkExpose', () => {
    let savedExposedClasses: Function[];

    beforeEach(() => {
        savedExposedClasses = Array.from(sdkExposedClasses);
    });

    afterEach(() => {
        sdkExposedClasses.clear();
        for (const exposedClass of savedExposedClasses) {
            sdkExposedClasses.add(exposedClass);
        }
    });

    it('adds the class to the sdk exposed classes storage', () => {
        @SdkExpose()
        class ExposedDto {}

        expect(sdkExposedClasses.has(ExposedDto)).toBe(true);
    });

    it('does not register the class in propertyStorage or sdkDtos', () => {
        @SdkExpose()
        class ExposedDto {}

        expect(propertyStorage.has(ExposedDto)).toBe(false);
        expect(sdkDtos.has(ExposedDto)).toBe(false);
    });

    it('returns the original constructor so the class stays usable', () => {
        class PlainDto {
            value = 42;
        }

        const decorated = SdkExpose()(PlainDto);
        expect(decorated).toBe(PlainDto);
        expect(new decorated().value).toBe(42);
    });

    it('does not duplicate a class exposed twice', () => {
        class ExposedDto {}

        const sizeBefore = sdkExposedClasses.size;
        SdkExpose()(ExposedDto);
        SdkExpose()(ExposedDto);

        expect(sdkExposedClasses.size).toBe(sizeBefore + 1);
    });
});
