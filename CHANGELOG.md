## [1.0.0](https://github.com/omar-dulaimi/prisma-custom-models-generator/compare/v0.1.0...v1.0.0) (2026-07-28)

### ⚠ BREAKING CHANGES

* **breaking:** requires Node ^20.19 || ^22.12 || >=24.0 and Prisma 6 or 7;
Prisma 4 and 5 are no longer supported. Regeneration no longer overwrites
existing files, so a scaffold you have edited will not pick up changes to the
generated shape unless you delete it or set `force = "true"`.

Verification: `npm run build`, `typecheck`, `lint` and `test` (41 tests) exit 0
on Node 20.19.0, 22.22.0 and 24.13.1. scripts/verify-package.sh packs the
package, installs the tarball into an empty project, runs `npx prisma
generate`, hand-edits a scaffold, regenerates, asserts the edit and unrelated
files survived, and type-checks the result against a real generated client
under --strict; it passes on all three Node versions against Prisma 7.9.1 and
on Node 22 against Prisma 6.19.3.

### 🐛 Bug Fixes

* **breaking:** run on Prisma 7 and stop deleting hand-written code ([65c3af8](https://github.com/omar-dulaimi/prisma-custom-models-generator/commit/65c3af84c14333fee895a70fddd05999a97de7e5))
