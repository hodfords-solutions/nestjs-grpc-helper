import { Property } from '../decorators/property.decorator';
import { IsBoolean, IsNumber, IsString } from 'class-validator';

export class NativeResponseValue {
    @Property({ type: Boolean })
    @IsBoolean()
    grpcNative: boolean = true;
}

export class NativeBooleanValue extends NativeResponseValue {
    @Property({ type: Boolean })
    @IsBoolean()
    value: boolean;
}

export class NativeStringValue extends NativeResponseValue {
    @Property({ type: String })
    @IsString()
    value: string;
}

export class NativeNumberValue extends NativeResponseValue {
    @Property({ type: Number, format: 'float' })
    @IsNumber()
    value: number;
}
