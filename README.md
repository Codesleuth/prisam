# @codesleuth/prisam [![CI](https://github.com/Codesleuth/prisam/actions/workflows/ci.yml/badge.svg)](https://github.com/Codesleuth/prisam/actions/workflows/ci.yml)

> [!NOTE]
> _Written with assistance from AI (GPT5)._

**_A tiny, zero-dependency wrapper that makes using Prisma driver adapters safe and predictable._**

Prisam builds your adapter and Prisma client, verifies the connection with a lightweight health check, retries with exponential backoff on transient failures, and deduplicates concurrent connect calls so you don’t stampede your database during cold starts.

- Works with any Prisma driver adapter, see: [Prisma driver adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers#database-driver-adapters)
- Ensures the adapter and client are actually healthy before you use them
- Retries (up to 10 attempts) with exponential backoff
- Coalesces concurrent callers into a single in-flight connection
- Minimal surface area: grab a client with `getPool()` and go

## Why this exists

If you’ve moved to serverless or serverful-but-ephemeral runtimes, you’ve likely hit one (or more) of these:

- Connections occasionally fail on startup, then magically succeed if you retry
- Multiple requests boot at once and all try to connect, multiplying load and failures
- You want one place to create the adapter and Prisma client correctly, and to clean them up

prisam solves exactly this: one place to build your adapter and Prisma client, verify them with a quick `SELECT 1`, and hand you a ready-to-use client—reliably.

## Installation

- Install the package and your chosen Prisma adapter e.g. `@prisma/adapter-pg`.
- Make sure you already have `@prisma/client` set up in your project.

```sh
npm install @codesleuth/prisam @prisma/adapter-pg
```

## Quick start

Below is a minimal, SQL Server setup. Plug in your own adapter in place of `PrismaMssql`.

```ts
import { PrismaPool } from "@codesleuth/prisam";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

const pool = new PrismaPool<PrismaClient>(
  (adapter) => new PrismaClient({ adapter }),
  () => new PrismaMssql({ server: 'localhost' })
);
```

## What `prisam` does under the hood

When you call `getPool()`:

1. Creates your adapter factory with `createAdapterFactory()`
2. Connects the underlying driver and executes `SELECT 1`
3. Builds your `PrismaClient` with the adapter
4. Executes `SELECT 1` again through Prisma to confirm the client works
5. Returns the ready client

If any step fails, it retries up to 10 times with exponential backoff (1s, 4s, 9s, …). Multiple callers share the same in-flight promise, so only one connection attempt runs at a time.

## Logging

prisam uses the `debug` package with the namespace `prisam`.

```sh
# macOS/Linux
export DEBUG=prisam
```

You’ll see concise messages for creation, health checks, retries, and cleanup.

## API

All exports are from `@codesleuth/prisam` (TypeScript first-class).

- Types
  - `PrismaClientBasic`: minimal shape required by the pool (`$executeRaw`, `$disconnect`)
  - `PrismaClientBuilder<T>`: `(adapter: SqlDriverAdapterFactory) => T`
  - `SqlDriverAdapterBuilder`: `() => SqlDriverAdapterFactory`
- Class
  - `class PrismaPool<T extends PrismaClientBasic>`
    - `constructor(clientBuilder, adapterBuilder)`
    - `getPool(): Promise<T>` — returns a healthy client; deduplicates concurrent calls
    - `dispose(): Promise<void>` — disconnects the client and clears internal state

Tip: pass your real `PrismaClient` type parameter to keep full model typing:

```ts
const prismaPool = new PrismaPool<PrismaClient>(
  createPrismaClient,
  createAdapterFactory
);
```

## Gotchas and guidance

- This does not retry your application queries—only the initial connection/bootstrap.
- Create a single pool per database/adapter and reuse it; don’t instantiate per request.
- Call `dispose()` in tests or when you explicitly want to tear down the client.
- Ensure your adapter factory is idempotent and safe to recreate.

## License

MIT © David Wood
