#!/usr/bin/env bash
# Build the publishable package into ./package.
#
# The repo root is intentionally `private: true` so a stray `npm publish` at the
# root cannot ship the source tree, the fixture schema or the dev dependency
# list. `./package` is the only thing that gets published.
set -euo pipefail

START_TIME=$SECONDS
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "Building package..."
rm -rf lib package
npx tsc

echo "Copying files..."
mkdir -p package
cp -r lib package/lib
cp README.md LICENSE package/

# Rewrite package.json rather than sed-ing it: the published manifest must drop
# devDependencies and the dev-only scripts, and flip `private` off.
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
delete pkg.devDependencies;
delete pkg.private;
pkg.scripts = {};
pkg.files = ["lib", "README.md", "LICENSE"];
fs.writeFileSync("package/package.json", JSON.stringify(pkg, null, 2) + "\n");
'

# The generator is launched as a bin; without the exec bit npm still works
# (it creates its own shim) but a direct `./lib/generator.js` would not.
chmod +x package/lib/generator.js

echo "Verifying the built entry point loads..."
node -e 'require("'"$ROOT"'/package/lib/prisma-generator.js")'

ELAPSED_TIME=$((SECONDS - START_TIME))
echo "Done in ${ELAPSED_TIME}s. Publishable package is in ./package"
