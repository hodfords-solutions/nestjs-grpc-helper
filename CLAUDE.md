# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

`@hodfords/nestjs-grpc-helper` is a NestJS library that simplifies gRPC integration by:
- Providing decorators to define gRPC microservices (similar to NestJS controllers)
- Auto-generating `.proto` files from TypeScript classes using reflection metadata
- Generating TypeScript SDK packages that other services can import for type-safe gRPC calls
- Providing a documentation UI for gRPC services (served at `/microservice-documents`)
- Supporting mock data generation via Faker.js decorators

## Commands

```bash
npm run build          # Build library (cleans dist/, runs nest build, copies assets)
npm run lint           # ESLint with auto-fix
npm run format         # Prettier formatting
npm run start:dev      # Run sample app in watch mode
npm run build:sample-sdk      # Build sample sdk app
```

## Code Style

- **Prettier**: single quotes, 120 char width, 4-space indent, no trailing commas, semicolons
- **ESLint**: extends `@typescript-eslint/recommended` + `prettier/recommended`; `@typescript-eslint/no-explicit-any` is disabled
- Lint-staged runs on `lib/**/*.ts` files via Husky pre-commit hooks

## Architecture

### Source Layout

- **`lib/`** — Library source code (published as the npm package)
- **`sample/`** — Example NestJS application demonstrating library usage
- **`frontend/`** — Vite app for the gRPC documentation UI
- **`sdk/`** — Generated SDK output directory

### Core Flow: Decorator → Metadata → Code Generation

The library follows a metadata-driven code generation pattern:

1. **Decorators** (`lib/decorators/`) attach metadata to classes/methods/parameters via `reflect-metadata`:
   - `@RegisterGrpcMicroservice()` / `@GrpcAction()` — register services and methods
   - `@GrpcValue()`, `@GrpcParam()`, `@GrpcId()`, `@GrpcEnum()`, etc. — annotate parameters
   - `@Property()` — define DTO fields with type info, validation, and Swagger metadata
   - `@MockMethod()`, `@MockSample()`, `@MockNested()` — attach mock generation instructions

2. **Storages** (`lib/storages/`) hold collected metadata at runtime:
   - `microserviceStorage` — array of registered microservice classes
   - `propertyStorage` — map of DTO property metadata

3. **Services** (`lib/services/`) consume metadata and generate code via Handlebars templates:
   - `GenerateProtoService` — generates `.proto` files from DTOs/responses
   - `GenerateMicroserviceService` — generates full SDK packages (services, modules, models, enums)
   - `GenerateDocumentService` — creates documentation data for the UI

4. **Templates** (`lib/templates/`) — `.hbs` Handlebars templates for proto definitions, SDK services, modules, mocks, and documentation

### Key Components

- **`lib/clients/custom-grpc.client.ts`** — Extended `ClientGrpcProxy` with service caching and support for all gRPC channel options (message size limits, keepalive, etc.)
- **`lib/sdk-stub/helpers/grpc.helper.ts`** — Runtime helper bundled into generated SDKs; provides `GrpcHelper` with fluent API (`service().method().data().getOne()/getMany()`) for calling gRPC services
- **`lib/helpers/property.helper.ts`** — Traverses class hierarchies to extract property metadata, handling inheritance and nested types
- **`lib/helpers/proto-type.helper.ts`** — Maps TypeScript types to protobuf types
- **`lib/type-helpers/`** — `PickType`, `OmitType`, `PartialType`, `IntersectionType` for composing DTOs
- **`lib/documents/`** — `MicroserviceDocumentModule` dynamic module that serves the documentation UI

### Build & Publish

The library is built with `nest build`. The `postbuild` script copies `package.json`, `README.md`, and `.npmrc` into `dist/lib/` for npm publishing. The published package comes from `dist/lib/`.
