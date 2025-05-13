import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

export function useSdkStaticAssets(app: NestExpressApplication) {
    app.useStaticAssets(join(__dirname, '../frontend'));
}
