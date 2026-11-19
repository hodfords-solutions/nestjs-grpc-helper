import { NullableGrpcClassResponseNamePrefix, ResponseMetadata } from '@hodfords/nestjs-response';
import { SdkResponseKind } from '../types/sdk-descriptor.type.js';
import { isPrimitiveType } from './type.helper.js';

export type WireResponse = {
    responseKind: SdkResponseKind;
    /** Proto message the rpc returns */
    wireResponseType: string;
    /** Message inside the nullable envelope; set only for the two nullable kinds */
    nullableInner?: string;
};

const emptyMessage = 'google.protobuf.Empty';

/**
 * Decides how a method's response travels on the wire. The proto generator and the SDK descriptor
 * both read it from here, so the rpc signature and the generated clients cannot disagree.
 * An array is never nullable: the server only puts a non-array result in the nullable envelope.
 */
export function resolveWireResponse(response: ResponseMetadata | undefined): WireResponse {
    if (!response) {
        return { responseKind: 'empty', wireResponseType: emptyMessage };
    }

    const className = response.responseClass.name;
    const isPrimitive = isPrimitiveType(response.responseClass);

    if (response.isArray) {
        return { responseKind: isPrimitive ? 'nativeList' : 'list', wireResponseType: `Proto${className}List` };
    }

    const message = isPrimitive ? `Native${className}Value` : className;
    if (response.isAllowEmpty) {
        // The server answers { value: <message> | null, grpcNullable: true }
        return {
            responseKind: isPrimitive ? 'nullableNative' : 'nullable',
            wireResponseType: `${NullableGrpcClassResponseNamePrefix}${message}`,
            nullableInner: message
        };
    }

    return { responseKind: isPrimitive ? 'native' : 'single', wireResponseType: message };
}
