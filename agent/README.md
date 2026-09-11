# rayner-agent

The Python half of Rayner OS. A LangGraph tool-calling agent behind the `/capture`
chat box, deployed as a Lambda container image. The Next app keeps session auth, the
UI, realtime, and the MCP/OAuth server; everything model-facing lives here.

Plan of record: `~/.claude/plans/spicy-knitting-stroustrup.md`.

## Setup

```bash
uv sync
cp .env.example .env      # nothing is required for /health
```

Optional, for staying across the design decisions in the plan:

```bash
npx skills add https://github.com/mattpocock/skills --skill grill-me
```

## Running

```bash
uv run uvicorn rayner_agent.app:app --reload --port 8000
curl localhost:8000/health
```

```bash
uv run pytest
uv run ruff check
```

Once the graph exists (phase 4), `uv run langgraph dev` opens Studio against the same
compiled graph the FastAPI app serves. It's a debugging affordance, not a second server.

## Container

Built for **arm64** — it compiles natively on Apple Silicon and Graviton Lambda is
cheaper than x86.

```bash
docker build --platform linux/arm64 -t rayner-agent:dev .
docker run --rm -p 9000:8080 rayner-agent:dev
curl -XPOST "localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"requestContext":{"http":{"method":"GET","path":"/health"}},"rawPath":"/health","version":"2.0"}'
```

The Lambda base image expects an event payload, not an HTTP request — hence the
envelope above rather than a plain `curl /health`.

## Notes that cost time to rediscover

- **Never put this function in a VPC.** Supabase is reached over the public internet.
  A VPC means a NAT Gateway at ~$32/month for no benefit.
- **`handler` flushes tracers before returning.** Lambda freezes the moment the handler
  returns, and LangSmith uploads on a background thread. Without the flush, traces
  vanish intermittently and it reads like the agent never ran.
- **Cold start never appears in LangSmith.** It happens during init, before the handler.
  That number is `Init Duration` in CloudWatch, so RCA means checking both places.
- **The checkpointer needs `prepare_threshold=None`.** Supabase's transaction pooler is
  pgbouncer, which can't do prepared statements; psycopg uses them by default.
- **Checkpoint tables belong in the `langgraph` schema**, via
  `?options=-csearch_path%3Dlanggraph` on the connection string. PostgREST only
  serves `public`, so that's what keeps conversation state unreachable by the
  browser's anon key. If those tables show up in `public`, the option didn't take.
- **User id comes from the JWT, never from a request body.** The Supabase key here
  bypasses RLS, so that check is the only thing scoping a write.
