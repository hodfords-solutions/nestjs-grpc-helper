#! /bin/bash

npm view @hodfords/nestjs-grpc-helper@"$(node -p "require('./package.json').version")" version && echo "Package is already published" && exit 0 || true
npm install
npm run build
cd frontend && npm install && npm run build -- --base-href ""
cp -r dist/frontend ../dist/libs
cd ..
cp -r libs/sdk-stub dist/libs
cp package.json dist/libs
cp .npmrc dist/libs
cp README.md dist/libs
cd dist/libs
npm publish --access public