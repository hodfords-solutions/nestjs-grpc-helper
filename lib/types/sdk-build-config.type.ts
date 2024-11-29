export type SdkBuildConfigType = {
    name: string;
    packageName: string;
    format?: boolean;
    build?: boolean;
    output: string;
    outputBuild?: string;
    removeOutput?: boolean;
    tsconfig?: any;
};
