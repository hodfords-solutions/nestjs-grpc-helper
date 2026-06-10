/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import * as Handlebars from 'handlebars';
import { HbsGeneratorService } from './hbs-generator.service';

describe('HbsGeneratorService', () => {
    let service: HbsGeneratorService;

    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

    beforeAll(() => {
        service = new HbsGeneratorService();
    });

    describe('compileTemplate', () => {
        it('should compile a template from the lib/templates directory with the given data', () => {
            const content = service.compileTemplate('proto-native-list.hbs', { name: 'String', type: 'string' });
            expect(normalize(content)).toBe(
                'message ProtoStringList { repeated string items = 1; bool grpcArray = 2; }'
            );
        });

        it('should keep triple-stash content unescaped', () => {
            const content = service.compileTemplate('service-interface.hbs', {
                name: 'UserDto',
                propertyContent: 'string name = 1;'
            });
            expect(normalize(content)).toContain('message UserDto { string name = 1; }');
            expect(normalize(content)).toContain(
                'message ProtoUserDtoList { repeated UserDto items = 1; bool grpcArray = 2; }'
            );
        });

        it('should throw when the template does not exist', () => {
            expect(() => service.compileTemplate('does-not-exist.hbs', {})).toThrow();
        });
    });

    describe('registered handlebars helpers', () => {
        it('should register a camelCase helper', () => {
            const template = Handlebars.compile('{{camelCase value}}');
            expect(template({ value: 'UserMicroservice' })).toBe('userMicroservice');
            expect(template({ value: 'hello-world example' })).toBe('helloWorldExample');
        });

        it('should register a hasItems block helper rendering the main block for non empty arrays', () => {
            const template = Handlebars.compile('{{#hasItems items}}has{{else}}empty{{/hasItems}}');
            expect(template({ items: [1] })).toBe('has');
        });

        it('should render the inverse block for empty or missing arrays', () => {
            const template = Handlebars.compile('{{#hasItems items}}has{{else}}empty{{/hasItems}}');
            expect(template({ items: [] })).toBe('empty');
            expect(template({})).toBe('empty');
        });
    });
});
