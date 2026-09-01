#! /bin/bash

pnpm view @hodfords/nestjs-grpc-helper@"$(node -p "require('./package.json').version")" version && echo "Package is already published" && exit 0 || true
pnpm install --frozen-lockfile
pnpm run build
cd frontend && pnpm install --frozen-lockfile && pnpm run build --base-href ""
cp -r dist/frontend ../dist/lib
cd ..
cp -r lib/sdk-stub dist/lib
cp -r lib/templates dist/lib
cp package.json dist/lib
cp .npmrc dist/lib
cp README.md dist/lib
cd dist/lib
pnpm publish --access public --no-git-checks
