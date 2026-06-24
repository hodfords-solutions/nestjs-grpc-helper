export type SdkBuildConfigType = {
    name: string;
    packageName: string;
    aiSkill?: {
        name: string;
        description: string;
    };
    format?: boolean;
    formatter?: 'prettier' | 'oxfmt';
    build?: boolean;
    addAllowDecorator?: boolean;
    output: string;
    outputBuild?: string;
    removeOutput?: boolean;
    tsconfig?: any;
};
