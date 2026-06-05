# sample-consumer

A minimal example of **consuming the generated gRPC SDK** (`../../sdk`) to make type-safe
calls against the `sample` microservice server.

## How it works

- `consumer.module.ts` imports `SdkNameModule.register({ url, timeout })` from the
  generated SDK. This wires up the gRPC client (package `sdkName`,
  `sdk/microservice.proto`) and exposes the generated `AppMicroservice` client.
- `consumer.runner.ts` injects `AppMicroservice` and calls its methods. Each call is
  fully type-checked against the DTOs/responses generated from the server's decorators.
- `main.ts` boots a standalone Nest application context, runs the calls, prints the
  responses, and exits.

## Running it

1. Start the `sample` gRPC server (serves package `sdkName` on `0.0.0.0:50059`):

   ```bash
   npm run start:dev
   ```

2. In another terminal, run the consumer:

   ```bash
   npm run start:consumer
   ```

Expected output:

```
findOne -> {"items":[{"name":"test"},{"name":"test2"}],"total":10,...}
findMany -> [{"name":"test"},{"name":"test2"}]
anyDto -> [{"name":"{\"source\":\"consumer\"}","isAdmin":true},{"name":"test2"}]
findUserByAddress(exists) -> {"value":{"name":"test"},"grpcNullable":true}
findUserByAddress(missing) -> {"grpcNullable":true}
All SDK calls completed successfully
```

> Nullable responses arrive wrapped as `{ value, grpcNullable }` — read `.value` for the
> resolved object (`undefined` when not found).
