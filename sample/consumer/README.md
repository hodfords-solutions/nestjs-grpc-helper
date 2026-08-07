# sample-consumer

A minimal example of **consuming the generated gRPC SDK** (`../../sdk`) to make type-safe
calls against the `sample` microservice server.

## How it works

- `consumer.module.ts` imports `SdkNameModule.register({ url, timeout, requestInitializer })`
  from the generated SDK. This wires up the gRPC client (package `sdkName`,
  `sdk/microservice.proto`) and exposes the generated `AppMicroservice` client. The
  `requestInitializer` attaches a `workspace-id` gRPC metadata header to every request.
- `consumer.runner.ts` injects `AppMicroservice` and calls **every** method on it. Each
  call is fully type-checked against the DTOs/responses generated from the server's
  decorators, and wrapped so one failure doesn't abort the rest.
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

Expected output (abridged):

```
findOne -> {"items":[{"name":"test"},{"name":"test2"}],"total":10,...}
findMany -> [{"name":"test"},{"name":"test2"}]
anyDto -> [{"name":"{\"source\":\"consumer\"}","isAdmin":true},{"name":"test2"}]
checkUserActive -> false
countUsers -> 1
getUserTags -> ["test","test2","test3"]
getUserByType -> "123"
findUserByAddress(exists) -> {"name":"test"}
findUserByAddress(missing) -> null
listUsers -> "123"
getWorkspaceId -> "123"
All SDK calls completed successfully
```

Notes:

- `@GrpcId` / `@GrpcIds` / `@GrpcMetadataId` parameters are validated as **UUIDs** on the
  server, so the runner passes UUID values for ids and the `workspace-id` header.
- `emptyFunction` / `emptyParams` are logged as `FAILED` — the sample server's void methods
  return arrays against a `google.protobuf.Empty` response, which the SDK can't decode. This
  is a quirk of those particular sample handlers, not of the SDK itself.
