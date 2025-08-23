export function isPrimitiveType(type: any): boolean {
    const primitiveTypes = [String, Number, Boolean];
    return primitiveTypes.includes(type);
}
