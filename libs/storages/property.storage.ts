import { PropertyType } from '@hodfords/nestjs-grpc-helper';

export const propertyStorage = new Map<Function, PropertyType[]>();
export const sdkDtos = new Set<Function>();
