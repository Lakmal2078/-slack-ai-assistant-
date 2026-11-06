# Slack AI Assistant (MVP)

TypeScript Slack assistant with Slack Bolt, OpenAI Responses API, PostgreSQL/Prisma, Redis/BullMQ, conversational context, tool definitions, and approval records.

## MVP capabilities

- Slack DM and `@Assistant` mention intake.
- `/assistant` slash command.
- Background processing through BullMQ.
- OpenAI Responses API integration.
- Thread-scoped conversation history and user-scoped memory retrieval.
- Tool registry with strict argument validation.
- Approval database model and interactive approve/reject handler.
- Workspace allowlist and basic event deduplication.

> Safety boundary: this repository is a production-oriented starter, not a fully audited production service. The approval workflow currently executes only the allowlisted `post_slack_message` action after the original requester approves it. Add a dedicated approved-action worker, action-specific authorization, and integration tests before adding more side-effecting tools. The sample `search_workspace_messages` tool is a stub and does not search private or workspace-wide history.

## Requirements

- Node.js 22+
- PostgreSQL 16+
- Redis 7+
- Slack app credentials
- OpenAI API key

## Local setup

1. Copy `.env.example` to `.env` and fill in credentials.
2. Start infrastructure: `docker compose up -d postgres redis`.
3. Install packages: `npm install`.
4. Generate Prisma client: `npm run db:generate`.
5. Create/apply the initial migration: `npm run db:dev`.
6. Start the app: `npm run dev`.

For local Slack development, enable Socket Mode and set:
- `SLACK_SOCKET_MODE=true`
- `SLACK_APP_TOKEN=xapp-...`

## Slack app setup

Create an app at https://api.slack.com/apps.

### Bot token scopes

Add these OAuth scopes under OAuth & Permissions:
- `app_mentions:read`
- `chat:write`
- `im:history`
- `im:read`
- `im:write`
- `commands`

Install/reinstall the app to the workspace after changing scopes.

### Event subscriptions

Subscribe to bot events:
- `app_mention`
- `message.im`

For Socket Mode, enable Socket Mode and create an app-level token with `connections:write`.
For HTTP mode, configure an HTTPS Request URL pointing to the Bolt receiver endpoint and set `SLACK_SOCKET_MODE=false`. Deploy behind a trusted TLS-terminating ingress.

### Slash command

Create `/assistant` and point it to the same deployed app's Slack request endpoint. Bolt handles the command.

### Interactivity

Enable Interactivity & Shortcuts and configure the request URL when using HTTP mode. Approval buttons should be added to messages by the approved-action request flow.

## Cloud deployment

Deploy the container to a managed container platform (Cloud Run, ECS/Fargate, Azure Container Apps, Fly.io, or Kubernetes).

Recommended managed services:
- App: container service with at least one always-on instance if using Socket Mode.
- PostgreSQL: managed PostgreSQL with backups and TLS.
- Redis: managed Redis with TLS and authentication.
- Secrets: cloud secret manager; never bake `.env` into the image.
- Ingress: HTTPS and request size limits.

For HTTP Events API mode, set `SLACK_SOCKET_MODE=false` and configure a public HTTPS endpoint. For Socket Mode, use a persistent worker/container and app-level token. If deploying multiple replicas, ensure the queue worker and Slack event intake are scaled independently and event deduplication remains shared.

## Production hardening checklist

- [ ] Replace the placeholder approval handling with a separate approved-action queue and allowlisted executor.
- [ ] Add approval Slack Block Kit buttons and verify the actor, workspace, expiry, and action hash on every decision.
- [ ] Implement Slack event signature validation via Bolt's receiver (do not bypass it).
- [ ] Add a persistent `ProcessedEvent` table with a unique `event_id`; Redis/BullMQ job IDs alone are not a durable exactly-once guarantee.
- [ ] Add per-user and per-workspace rate limits.
- [ ] Add explicit memory capture/delete commands and retention policies.
- [ ] Add tenant-aware authorization for all database queries and tools.
- [ ] Add OpenAI timeout/retry policy and token/cost budgets.
- [ ] Add structured metrics, traces, alerting, and dead-letter queue handling.
- [ ] Add integration tests against a Slack test workspace.
- [ ] Review Slack scopes and cloud network/database security.
- [ ] Run dependency and container vulnerability scans.

## Environment variables

See `.env.example`. In production, inject all values through the platform's secret manager. `ALLOWED_WORKSPACE_IDS` is a comma-separated allowlist; leave empty only if the app is intentionally open to any workspace that installs it.

## Notes

- `threadTs` identifies the Slack thread context. For slash commands, a production implementation should reply using `response_url` or post into the channel with a suitable thread strategy; the current command handler uses a simplified placeholder.
- The current assistant persists user and assistant messages. Add retention and deletion workflows before processing sensitive data.
- The example model name is configurable. Set `OPENAI_MODEL` to a model enabled for your API project.
