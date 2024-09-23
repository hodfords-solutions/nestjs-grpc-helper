import { Allow, IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrpcTestDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    serviceName: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    methodName: string;

    @ApiProperty()
    @Allow()
    data: any;

    @ApiProperty()
    @IsNotEmpty()
    @Allow()
    @IsBoolean()
    isFindMany: boolean;
}
