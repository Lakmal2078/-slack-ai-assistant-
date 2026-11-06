# Cloud deployment reference

1. Provision managed PostgreSQL and Redis.
2. Create a container service and deploy this repository's Dockerfile.
3. Inject the variables from `.env.example` using your cloud secret manager.
4. Run `npx prisma migrate deploy` as a release/migration job, not concurrently in every replica.
5. Choose one Slack connection mode:
   - Socket Mode: persistent process, `SLACK_SOCKET_MODE=true`, app token with `connections:write`.
   - HTTP Events API: public HTTPS endpoint, `SLACK_SOCKET_MODE=false`, configure Slack request URL and interactivity URL.
6. Configure health checks and graceful shutdown.
7. Start with one app replica; scale intake and queue workers separately after load testing.

For production, split the Slack event receiver and BullMQ worker into separate process roles. The starter currently runs both in one process for simplicity.
