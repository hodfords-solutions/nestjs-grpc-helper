import { GenerateMicroserviceService } from '../services/generate-microservice.service';
import { GenerateProtoService } from '../services/generate-proto.service';
import { GenerateDocumentService } from '../services/generate-document.service';
import { SdkBuildConfigType } from '../types/sdk-build-config.type';

export function generateSdk(config: SdkBuildConfigType) {
    new GenerateMicroserviceService(config).generate();
}

export function generateProtoService(packageName: string, dirPath: string) {
    new GenerateProtoService(packageName, dirPath).generate();
}

export function generateDocumentService(packageName: string) {
    return new GenerateDocumentService(packageName).generate();
}
