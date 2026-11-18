export const SDK_LANGUAGES = ['ts', 'rust', 'go'] as const;
export type SdkLanguage = (typeof SDK_LANGUAGES)[number];

export type RustSdkConfigType = {
    crateName: string;
    version?: string;
    output: string;
    build?: boolean;
};

export type GoSdkConfigType = {
    module: string;
    output: string;
    build?: boolean;
};

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
    rust?: RustSdkConfigType;
    go?: GoSdkConfigType;
};
