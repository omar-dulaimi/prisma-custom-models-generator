#!/usr/bin/env bash
# End-to-end verification against the PACKAGED artifact, not the source tree.
#
# Both defects fixed in 0.2.0 shipped for years while the repo's own
# `prisma generate` run looked fine, because the repo runs the generator from
# ./lib via a relative path with the repo's own node_modules on hand. A consumer
# instead installs a tarball and resolves the generator by name, so that is what
# this script exercises:
#
#   1. build the package
#   2. npm pack it
#   3. install the tarball into an empty project
#   4. run the README's headline command, `npx prisma generate`
#   5. hand-edit a scaffold, regenerate, and assert the edit survived
#   6. typecheck the result against the real generated client
#
# Usage:
#   scripts/verify-package.sh [workdir]
#   PRISMA_VERSION=6.19.3 scripts/verify-package.sh [workdir]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
PRISMA_VERSION="${PRISMA_VERSION:-7.9.1}"
PRISMA_MAJOR="${PRISMA_VERSION%%.*}"

say() { printf '\n=== %s ===\n' "$1"; }
fail() { printf '\nFAIL: %s\n' "$1" >&2; exit 1; }

say "node $(node --version), npm $(npm --version), prisma ${PRISMA_VERSION}"

say "building package"
cd "$ROOT"
./package.sh >/dev/null

say "packing tarball"
cd "$ROOT/package"
TARBALL_NAME="$(npm pack --silent)"
TARBALL="$ROOT/package/$TARBALL_NAME"
test -f "$TARBALL" || fail "npm pack produced no tarball"
echo "$TARBALL_NAME"

say "tarball contents"
# Capture the listing first: `tar | grep -q` exits grep early, which SIGPIPEs
# tar and trips `pipefail`, so the assertion would fail on a healthy tarball.
LISTING="$(tar -tzf "$TARBALL")"
echo "$LISTING" | sort

case "$LISTING" in
  *package/lib/generator.js*) ;;
  *) fail "tarball is missing the bin entry point" ;;
esac
case "$LISTING" in
  *package/src/* | *package/prisma/*)
    fail "tarball leaks the source tree or the fixture schema" ;;
esac

say "installing tarball into an empty project: $WORK"
rm -rf "$WORK"
mkdir -p "$WORK/prisma"
cd "$WORK"
cat > package.json <<'JSON'
{ "name": "verify-consumer", "version": "1.0.0", "private": true }
JSON

# Prisma 7 removed `datasource url` and made `prisma-client` the recommended
# provider; Prisma 6 still requires the url and has no prisma.config.ts. The
# generator has to work on both, so the fixture differs by major version.
if [ "$PRISMA_MAJOR" -ge 7 ]; then
  CLIENT_PROVIDER='prisma-client'
  cat > prisma.config.ts <<'TS'
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: 'file:./dev.db' },
});
TS
  cat > prisma/schema.prisma <<'PRISMA'
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

generator custom_models {
  provider = "prisma-custom-models-generator"
  output   = "../src/models"
  behavior = "EXTEND_CLIENT"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}

model Post {
  id    Int    @id @default(autoincrement())
  title String
}
PRISMA
else
  CLIENT_PROVIDER='prisma-client-js'
  cat > prisma/schema.prisma <<'PRISMA'
generator client {
  provider = "prisma-client-js"
}

generator custom_models {
  provider = "prisma-custom-models-generator"
  output   = "../src/models"
  behavior = "EXTEND_CLIENT"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}

model Post {
  id    Int    @id @default(autoincrement())
  title String
}
PRISMA
fi

npm install --no-audit --no-fund --silent \
  "prisma@${PRISMA_VERSION}" "@prisma/client@${PRISMA_VERSION}" "$TARBALL"

say "advisories in the installed consumer tree"
npm audit 2>&1 | tail -3 || true

say "the generator resolves by name from node_modules"
test -f node_modules/.bin/prisma-custom-models-generator \
  || fail "bin shim not installed"

say "running the README headline command: npx prisma generate"
npx prisma generate 2>&1 | tee generate-1.log
grep -q "Generated Prisma Custom Models Generator" generate-1.log \
  || fail "generator did not run"

say "generated files"
find src/models -type f | sort
test -f src/models/Users.ts || fail "Users.ts not generated"
test -f src/models/Posts.ts || fail "Posts.ts not generated"
grep -q "Prisma.defineExtension" src/models/Users.ts \
  || fail "EXTEND_CLIENT did not emit Prisma.defineExtension"

if [ "$CLIENT_PROVIDER" = 'prisma-client' ]; then
  grep -q 'from "../generated/prisma/client"' src/models/Users.ts \
    || fail "client import was not resolved relative to the generated client"
else
  grep -q 'from "@prisma/client"' src/models/Users.ts \
    || fail "legacy provider should import from @prisma/client"
fi

say "seeding hand-written code and unrelated files"
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/models/Users.ts')
s = p.read_text()
marker = "      // define methods here, comma-separated\n"
assert marker in s, "scaffold marker not found; cannot seed hand-written code"
p.write_text(s.replace(
    marker,
    "      async findByEmail(email: string) {\n"
    "        const ctx = Prisma.getExtensionContext(this);\n"
    "        return (ctx as any).findFirst({ where: { email } });\n"
    "      },\n",
))
PY
mkdir -p src/models/nested
echo 'export const UNRELATED = 1;' > src/models/unrelated.ts
echo 'export const NESTED = 1;' > src/models/nested/deep.ts
echo 'my notes' > src/models/NOTES.md

say "regenerating (this is where the old version destroyed everything)"
npx prisma generate 2>&1 | tee generate-2.log
grep -q "kept your edits" generate-2.log \
  || fail "generator did not report preserving the edit"

say "asserting survival"
grep -q "findByEmail" src/models/Users.ts \
  || fail "REGRESSION: hand-written method was destroyed"
test -f src/models/unrelated.ts   || fail "REGRESSION: unrelated.ts deleted"
test -f src/models/nested/deep.ts || fail "REGRESSION: nested/deep.ts deleted"
test -f src/models/NOTES.md       || fail "REGRESSION: NOTES.md deleted"
test -f src/models/Posts.ts       || fail "Posts.ts disappeared"

say "asserting colliding model names fail loudly instead of losing a model"
cp prisma/schema.prisma prisma/schema.prisma.bak
cat >> prisma/schema.prisma <<'PRISMA'

model Setting {
  id  Int    @id @default(autoincrement())
  key String
}

model Settings {
  id    Int    @id @default(autoincrement())
  value String
}
PRISMA
if npx prisma generate > collide.log 2>&1; then
  fail "colliding model names should have failed the run"
fi
grep -q "collide after pluralisation" collide.log \
  || fail "collision error message missing; got: $(tail -3 collide.log)"
mv prisma/schema.prisma.bak prisma/schema.prisma

say "typechecking the generated + hand-written code against the real client"
npm install --no-audit --no-fund --silent typescript@5.9.3 \
  "@prisma/adapter-better-sqlite3@${PRISMA_VERSION}"
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "use.ts"]
}
JSON
if [ "$CLIENT_PROVIDER" = 'prisma-client' ]; then
  cat > use.ts <<'TS'
import { PrismaClient } from './src/generated/prisma/client';
import { UsersExtension } from './src/models/Users';
import { PostsExtension } from './src/models/Posts';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const base = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: 'file:./dev.db' }),
});
export const prisma = base.$extends(UsersExtension).$extends(PostsExtension);

export async function run() {
  return prisma.user.findByEmail('someone@example.com');
}
TS
else
  cat > use.ts <<'TS'
import { PrismaClient } from '@prisma/client';
import { UsersExtension } from './src/models/Users';
import { PostsExtension } from './src/models/Posts';

const base = new PrismaClient();
export const prisma = base.$extends(UsersExtension).$extends(PostsExtension);

export async function run() {
  return prisma.user.findByEmail('someone@example.com');
}
TS
fi
npx tsc || fail "generated code does not typecheck"

say "ALL CHECKS PASSED (node $(node --version), prisma ${PRISMA_VERSION})"
