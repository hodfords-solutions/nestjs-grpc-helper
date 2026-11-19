/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { RESPONSE_METADATA_KEY, ResponseMetadata } from '@hodfords/nestjs-response';
import { Logger } from '@nestjs/common';
import { isFunction, isUndefined } from '@nestjs/common/utils/shared.utils.js';
import { isEmpty } from 'es-toolkit/compat';
import {
    GRPC_DESCRIPTION_METADATA_KEY,
    GRPC_METADATA_PARAMETERS_METADATA_KEY,
    GRPC_METHOD_METADATA_KEY,
    GRPC_PARAM_INDEX_METADATA_KEY,
    GRPC_STREAM_METADATA_KEY
} from '../constants/metadata-key.const.js';
import { isEnumProperty } from '../helpers/api-property.helper.js';
import { extractProperties } from '../helpers/property.helper.js';
import { enumMemberName } from '../helpers/sdk-naming.helper.js';
import { isPrimitiveType } from '../helpers/type.helper.js';
import { resolveWireResponse } from '../helpers/wire-response.helper.js';
import { microserviceStorage } from '../storages/microservice.storage.js';
import { MetadataParameterOptionType } from '../types/metadata-parameter-option.type.js';
import {
    SdkDescriptor,
    SdkEnumDescriptor,
    SdkMethodDescriptor,
    SdkNativeType,
    SdkServiceDescriptor
} from '../types/sdk-descriptor.type.js';

// Mirrors GenerateProtoService.generateNativeModelList / NativeNumberValue: Number travels as `float`.
const nativeTypes: Record<string, SdkNativeType> = {
    String: 'string',
    Boolean: 'bool',
    Number: 'float'
};

type ResponseDescription = Pick<SdkMethodDescriptor, 'responseKind' | 'responseType' | 'wireResponseType'>;

/**
 * Turns the registered microservices into a language-neutral model for the Rust and Go generators.
 * The response classification is shared with GenerateProtoService through resolveWireResponse;
 * sdk-descriptor.service.spec.ts still compares the descriptor against the generated proto.
 */
export class SdkDescriptorService {
    private logger = new Logger(SdkDescriptorService.name);

    describe(): SdkDescriptor {
        return {
            services: microserviceStorage
                .map((constructor) => this.describeService(constructor))
                .filter((service) => service.methods.length > 0),
            enums: this.describeEnums()
        };
    }

    private describeService(constructor: Function): SdkServiceDescriptor {
        const methods = Object.getOwnPropertyNames(constructor.prototype)
            .filter((propertyKey) => Reflect.hasMetadata(GRPC_METHOD_METADATA_KEY, constructor.prototype, propertyKey))
            .map((propertyKey) => this.describeMethod(constructor, propertyKey));

        return {
            name: constructor.name,
            description: Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, constructor),
            methods
        };
    }

    private describeMethod(constructor: Function, propertyKey: string): SdkMethodDescriptor {
        const prototype = constructor.prototype;
        const params = Reflect.getMetadata('design:paramtypes', prototype, propertyKey);
        const parameterIndex = Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, prototype, propertyKey);
        const response: ResponseMetadata = Reflect.getMetadata(RESPONSE_METADATA_KEY, prototype[propertyKey]);
        const metadataParams: MetadataParameterOptionType[] =
            Reflect.getMetadata(GRPC_METADATA_PARAMETERS_METADATA_KEY, prototype, propertyKey) || [];

        return {
            name: propertyKey,
            description: Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, prototype, propertyKey),
            requestType: isUndefined(parameterIndex) ? undefined : params[parameterIndex].name,
            ...this.describeResponse(response),
            isStream: Boolean(Reflect.getMetadata(GRPC_STREAM_METADATA_KEY, prototype, propertyKey)),
            metadataKeys: metadataParams.map((param) => param.name)
        };
    }

    private describeResponse(response: ResponseMetadata): ResponseDescription {
        const { responseKind, wireResponseType } = resolveWireResponse(response);
        const className = response?.responseClass.name;

        return {
            responseKind,
            responseType: isPrimitiveType(response?.responseClass) ? nativeTypes[className] : className,
            wireResponseType
        };
    }

    private describeEnums(): SdkEnumDescriptor[] {
        const enums = new Map<string, SdkEnumDescriptor>();
        const properties = Object.values(extractProperties()).flat();

        for (const { option } of properties) {
            // isEnumProperty() rejects the lazy `() => values` form, so a function is accepted here explicitly
            const isEnum = isEnumProperty(option) || (isFunction(option.enum) && !isEmpty(option.enumName));
            if (!isEnum || enums.has(option.enumName)) {
                continue;
            }

            const entries = this.describeEnumEntries(option.enum);
            if (!entries.length) {
                continue;
            }

            const isNumber = option.type === 'number' || entries.every((entry) => typeof entry.value === 'number');
            const item: SdkEnumDescriptor = {
                name: option.enumName,
                valueType: isNumber ? 'number' : 'string',
                entries
            };
            const skipReason = this.findEnumSkipReason(item, option.type === 'number');
            if (skipReason) {
                this.logger.warn(`Enum ${item.name} is skipped in the Rust and Go SDKs: ${skipReason}.`);
                // Remember the name so a later property using the same enum does not re-add it
                enums.set(option.enumName, undefined);
                continue;
            }
            enums.set(option.enumName, item);
        }

        return Array.from(enums.values()).filter(Boolean);
    }

    /**
     * The enum constants are a convenience (fields keep their wire type), so an enum the Rust and Go
     * generators cannot render safely is left out of both SDKs instead of breaking their build.
     */
    private findEnumSkipReason(item: SdkEnumDescriptor, isDeclaredNumber: boolean): string | undefined {
        const values = item.entries.map((entry) => entry.value);
        if (isDeclaredNumber && values.some((value) => typeof value !== 'number')) {
            return 'it is declared as a number but has non-numeric values';
        }
        if (item.valueType === 'string' && values.some((value) => typeof value !== 'string')) {
            return 'it mixes string and number values';
        }
        if (item.valueType === 'number') {
            const fraction = item.entries.find((entry) => !Number.isInteger(entry.value));
            if (fraction) {
                return `value ${fraction.value} of member "${fraction.key}" is not an integer`;
            }
            // Rust enums are #[repr(i32)] and Go constants are int32
            const outOfRange = item.entries.find(
                (entry) => Number(entry.value) < -(2 ** 31) || Number(entry.value) >= 2 ** 31
            );
            if (outOfRange) {
                return `value ${outOfRange.value} of member "${outOfRange.key}" does not fit in an int32`;
            }
        }

        return (
            this.findDuplicate(item, (entry) => String(entry.value), 'have the same value') ??
            this.findNameProblem(item)
        );
    }

    /**
     * Rust variants and Go constants must be unique, non-empty identifiers. Both are derived from enumMemberName()
     * without merging two names (Rust only escapes keywords, Go only adds the enum name as a prefix), so checking
     * the member names covers both languages.
     */
    private findNameProblem(item: SdkEnumDescriptor): string | undefined {
        const empty = item.entries.find((entry) => !enumMemberName(entry.key));
        if (empty) {
            return `member "${empty.key}" maps to an empty name`;
        }
        return this.findDuplicate(item, (entry) => enumMemberName(entry.key), 'map to the same name');
    }

    private findDuplicate(
        item: SdkEnumDescriptor,
        keyOf: (entry: SdkEnumDescriptor['entries'][number]) => string,
        problem: string
    ): string | undefined {
        const seen = new Map<string, string>();
        for (const entry of item.entries) {
            const key = keyOf(entry);
            if (seen.has(key)) {
                return `members "${seen.get(key)}" and "${entry.key}" ${problem}`;
            }
            seen.set(key, entry.key);
        }
        return undefined;
    }

    /** `enum` may be a TypeScript enum object, an array of values, or a function returning either. */
    private describeEnumEntries(enumOption: unknown): SdkEnumDescriptor['entries'] {
        const source = isFunction(enumOption) ? enumOption() : enumOption;
        if (Array.isArray(source)) {
            return Array.from(new Set<string | number>(source)).map((value) => ({ key: String(value), value }));
        }
        if (!source || typeof source !== 'object') {
            return [];
        }

        const record = source as Record<string, string | number>;
        // Numeric enums contain reverse mappings ({ ONE: 1, '1': 'ONE' }) — keep member names only
        return Object.keys(record)
            .filter((key) => isNaN(Number(key)))
            .map((key) => ({ key, value: record[key] }));
    }
}
