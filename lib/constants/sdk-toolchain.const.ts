export type SdkToolRequirement = {
    binary: string;
    /** Required `major.minor`. Omitted when any version is acceptable. */
    version?: string;
    install: string;
};

export const PROTOC_TOOL: SdkToolRequirement = {
    binary: 'protoc',
    install: 'brew install protobuf  (Debian/Ubuntu: apt-get install -y protobuf-compiler libprotobuf-dev)'
};

export const RUST_SDK_TOOLCHAIN = {
    tools: [
        { binary: 'protoc-gen-prost', version: '0.4', install: 'cargo install protoc-gen-prost@0.4.0 --locked' },
        { binary: 'protoc-gen-tonic', version: '0.4', install: 'cargo install protoc-gen-tonic@0.4.1 --locked' }
    ] as SdkToolRequirement[],
    minRustVersion: '1.85',
    crates: {
        prost: '0.13',
        tonic: '0.12',
        tokio: '1',
        tokioStream: '0.1',
        serdeJson: '1',
        thiserror: '1'
    }
};

export const GO_SDK_TOOLCHAIN = {
    tools: [
        {
            binary: 'protoc-gen-go',
            version: '1.36',
            install: 'go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6'
        },
        {
            binary: 'protoc-gen-go-grpc',
            version: '1.5',
            install: 'go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1'
        }
    ] as SdkToolRequirement[],
    goVersion: '1.23',
    modules: {
        grpc: 'v1.71.0',
        protobuf: 'v1.36.6'
    }
};
