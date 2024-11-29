export type SdkBuildConfigType = {
    name: string;
    format?: boolean;
    build?: boolean;
    output: string;
    outputBuild?: string;
    removeOutput?: boolean;
    tsconfig?: any;
};
