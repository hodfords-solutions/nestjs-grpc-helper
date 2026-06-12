import { Transform } from 'class-transformer';

/**
 * Marks a field as a polymorphic "any" payload for the gRPC wire. The proto
 * type generated for the field is `string` (with `format: 'any'`); this
 * decorator handles the JSON conversion on both ends:
 *
 *   - `__getData` (incoming wire / pre-validate): JSON.parse a string value
 *     back into the object/array shape so `@ValidateNested` can iterate it.
 *     Non-string values pass through unchanged; non-JSON strings fall back
 *     to the raw string so the interceptor never throws.
 *
 *   - `__sendData` (outgoing wire / post-validate): JSON.stringify the value
 *     so the proto `string` field receives valid JSON (otherwise protobufjs
 *     coerces arrays/objects via `String([...])` and the receiver sees
 *     `"[object Object],[object Object]"`).
 *     `null` / `undefined` skip the stringify so nullable `@ValidateNested`
 *     + `@IsOptional` fields keep working in single-pass flows (where the
 *     transform runs together with `__getData` before validation).
 *
 * Both branches operate on the same value in a single transform call, so
 * `applyTransforms(data, cls, { groups: ['__getData', '__sendData', '__grpc'] })`
 * runs the whole gRPC pipeline in one walk: parse (if string), stringify (if
 * non-null object).
 *
 * `isDto: true` is a short-circuit for SDK-side request DTOs that always
 * arrive as already-stringified JSON.
 */
export function AnyType({ isDto }: { isDto?: boolean } = {}) {
    return Transform((object) => {
        if (isDto && typeof object.value === 'string') {
            return JSON.parse(object.value);
        }

        const groups = object.options.groups ?? [];
        let value = object.value;

        if (groups.includes('__getData') && typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {
                /* keep the raw string */
            }
        }

        if (groups.includes('__sendData') && value !== null && value !== undefined) {
            value = JSON.stringify(value);
        }

        return value;
    });
}
