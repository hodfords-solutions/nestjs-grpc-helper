import { Type } from '@nestjs/common';
import { IntersectionType } from '@nestjs/swagger';
import { propertyStorage } from '../storages/property.storage';
import { addPropertyToStorage } from '@hodfords/nestjs-grpc-helper';

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type ClassRefsToConstructors<T extends Type[]> = {
    [U in keyof T]: T[U] extends Type<infer V> ? V : never;
};

type Intersection<T extends Type[]> = Type<UnionToIntersection<ClassRefsToConstructors<T>[number]>>;

export function IntersectionResponseType<T extends Type[]>(...classRefs: T) {
    const swaggerIntersectionType: any = IntersectionType(...classRefs);

    abstract class IntersectionTypeClass extends swaggerIntersectionType {}

    for (const classRef of classRefs) {
        const properties = propertyStorage.get(classRef);
        for (const property of properties) {
            addPropertyToStorage(IntersectionTypeClass, property.name, property.option);
        }
    }
    return IntersectionTypeClass as Intersection<T>;
}
