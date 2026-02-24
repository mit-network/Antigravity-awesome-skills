---
name: cloudflare-workers-expert
description: "Best practices and architectural guidance for deploying and building applications on Cloudflare Workers and Pages using Wrangler and Hono."
risk: safe
source: self
tags: ["cloudflare", "workers", "edge", "serverless", "hono"]
---

# Cloudflare Workers Expert

## Overview

This skill provides expert guidance on building, testing, and deploying robust applications on Cloudflare's edge network using Workers, Pages, KV, D1, and R2. It emphasizes modern development approaches, particularly using the Hono framework for routing.

## When to Use This Skill

- Use when bootstrapping a new Cloudflare Workers project.
- Use when designing an API intended to run at the edge.
- Use when configuring bindings (KV, D1, R2, Queues) in `wrangler.toml`.
- Use when debugging deployment or execution issues on Cloudflare.

## How It Works

### 1. The Environment

Cloudflare Workers run on the V8 engine, not Node.js. This means standard Node APIs (like `fs`, `child_process`) are not available, though polyfills exist for some modules.

- **Entry point:** Must export a `fetch` handler.
- **Environment bindings:** Resources like KV namespaces and D1 databases are accessed via the `env` object passed to the handler, not globally.
- **Wrangler:** Use `wrangler dev` for local development and `wrangler deploy` to publish.

### 2. Using Hono for Routing

Hono is the recommended framework for Workers. It is ultra-fast, lightweight, and specifically designed for the edge.

- Use caching middleware provided by Hono for optimal performance.
- Bindings are accessed via `c.env`.

### 3. State Management at the Edge

- **D1 (SQL Database):** For relational data. Use the `D1Database` binding.
- **KV (Key-Value):** For fast, globally distributed read-heavy data. Eventually consistent.
- **R2 (Object Storage):** S3-compatible storage.
- **Durable Objects:** Strongly consistent, single-instance coordination. Useful for WebSockets or collaborative editing.

## Examples

### Example 1: Basic Worker with Hono and Bindings Setup

**`src/index.ts`**

```typescript
import { Hono } from 'hono'

type Bindings = {
  MY_KV: KVNamespace
  DB: D1Database
  API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  // Access environment variables and bindings via c.env
  const value = await c.env.MY_KV.get('hello')
  return c.text(`Value from KV: ${value}`)
})

app.get('/users', async (c) => {
  // Access D1 database
  const { results } = await c.env.DB.prepare('SELECT * FROM users').all()
  return c.json(results)
})

export default app
```

### Example 2: Configuring `wrangler.toml`

```toml
name = "my-awesome-worker"
main = "src/index.ts"
compatibility_date = "2024-03-20"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "MY_KV"
id = "xxxxxxxxxxxxxxxxx"
preview_id = "yyyyyyyyyyyyyyyy"

[[d1_databases]]
binding = "DB"
database_name = "my-d1-db"
database_id = "zzzzzzzzzzzzzzzzz"
```

## Best Practices

- ✅ **Do:** Use `wrangler types` to generate TypeScript types for your bindings automatically.
- ✅ **Do:** Keep the `compatibility_date` updated in your `wrangler.toml` to access the latest V8 features and bug fixes.
- ✅ **Do:** Use `ctx.waitUntil()` inside Hono handlers to perform background tasks (like logging or updating analytics) without blocking the response to the client. E.g., `c.executionCtx.waitUntil(promise)`.
- ❌ **Don't:** Import Node.js specific libraries unless you enable the `nodejs_compat` compatibility flag, and even then, only supported APIs will work.
- ❌ **Don't:** Store secrets directly in code or `wrangler.toml`. Use `wrangler secret put <KEY>`.

## Common Pitfalls

- **Problem:** "Cannot read properties of undefined (reading 'MY_KV')"
  **Solution:** Ensure you are accessing bindings via the `env` argument (or `c.env` in Hono) passed to the request handler, not from process.env or the global scope.
- **Problem:** A timeout error when running long background tasks.
  **Solution:** Workers have a CPU limit. Offload long-running tasks to Cloudflare Queues or use Durable Objects if strong consistency is needed.
