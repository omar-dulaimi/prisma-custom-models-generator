[![npm version](https://badge.fury.io/js/prisma-custom-models-generator.svg)](https://badge.fury.io/js/prisma-custom-models-generator)
[![npm](https://img.shields.io/npm/dt/prisma-custom-models-generator.svg)](https://www.npmjs.com/package/prisma-custom-models-generator)
[![HitCount](https://hits.dwyl.com/omar-dulaimi/prisma-custom-models-generator.svg?style=flat)](http://hits.dwyl.com/omar-dulaimi/prisma-custom-models-generator)
[![npm](https://img.shields.io/npm/l/prisma-custom-models-generator.svg)](LICENSE)

<p align="center">
  <a href="https://github.com/omar-dulaimi/prisma-custom-models-generator">
    <img src="https://raw.githubusercontent.com/omar-dulaimi/prisma-custom-models-generator/master/logo.png" alt="Logo" width="200" height="200">
  </a>
  <h3 align="center">Prisma Custom Models Generator</h3>
  <p align="center">
    A Prisma generator that automates creating custom models from your Prisma schema.
    <br />
    <a href="https://github.com/omar-dulaimi/prisma-custom-models-generator#additional-options"><strong>Explore the options »</strong></a>
    <br />
    <br />
    <a href="https://github.com/omar-dulaimi/prisma-custom-models-generator/issues/new?template=bug_report.yml">Report Bug</a>
    ·
    <a href="https://github.com/omar-dulaimi/prisma-custom-models-generator/issues/new?template=feature_request.md">Request Feature</a>
  </p>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/omardulaimi">
    <img src="https://cdn.buymeacoffee.com/buttons/default-black.png" alt="Buy Me A Coffee" height="41" width="174">
  </a>
</p>

## Table of Contents

- [About The Project](#about-the-project)
- [Installation](#installation)
- [Usage](#usage)
- [Additional Options](#additional-options)
- [Community](#community)

# About The Project

Automatically generate custom models from your [Prisma](https://github.com/prisma/prisma) Schema. This includes all currently recommended ways as mentioned on [Prisma Docs](https://www.prisma.io/docs/concepts/components/prisma-client/custom-models). Updates every time `npx prisma generate` runs.

# Installation

Using npm:

```bash
 npm install prisma-custom-models-generator
```

Using yarn:

```bash
 yarn add prisma-custom-models-generator
```

# Usage

1- Star this repo 😉

2- Add the generator to your Prisma schema

```prisma
generator custom_models {
  provider       = "prisma-custom-models-generator"
  behavior       = "WRAP"
}
```

3- Running `npx prisma generate` for the following schema.prisma

```prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  title     String
  content   String?
  published Boolean  @default(false)
  viewCount Int      @default(0)
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  Int?
}
```

will generate this for the User model

```ts
import { PrismaClient } from '@prisma/client';

export function Users(prismaUser: PrismaClient['user']) {
  return Object.assign(prismaUser, {
    // define methods here, comma-separated
  });
}
```

or this

```ts
import { PrismaClient } from '@prisma/client';

export class Users {
  constructor(private readonly prismaUser: PrismaClient['user']) {}
}
```

# Additional Options

| Option     |  Description                                               | Type             |  Default      |
| ---------- | ---------------------------------------------------------- | ---------------- | ------------- |
| `output`   | Output directory for the generated routers and zod schemas | `string`         | `./generated` |
| `behavior` | Sets the preferred grouping logic                          | `WRAP Or EXTEND` | `WRAP`        |

Use additional options in the `schema.prisma`

```prisma
generator custom_models {
  provider       = "prisma-custom-models-generator"
  behavior       = "EXTEND"
}
```

# Community

[![Stargazers repo roster for @omar-dulaimi/prisma-custom-models-generator](https://reporoster.com/stars/omar-dulaimi/prisma-custom-models-generator)](https://github.com/omar-dulaimi/prisma-custom-models-generator/stargazers)
