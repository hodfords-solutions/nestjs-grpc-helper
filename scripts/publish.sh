#! /bin/bash

npm view @hodfords/nestjs-grpc-helper@"$(node -p "require('./package.json').version")" version && echo "Package is already published" && exit 0 || true
npm install
npm run build
cd frontend && npm install && npm run build -- --base-href ""
cp -r dist/frontend ../dist/lib
cd ..
cp -r lib/sdk-stub dist/lib
cp package.json dist/lib
cp .npmrc dist/lib
cp README.md dist/lib
cd dist/lib
npm publish --access public