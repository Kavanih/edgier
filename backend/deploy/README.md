# Hosting the backend

The frontend is static and lives on Vercel. Its `/api/*` calls are rewritten
(`frontend/vercel.json`) to the sidecar on the VPS, so the browser only ever
talks to Vercel over HTTPS and the sidecar needs no domain, certificate or CORS.

```
Browser ──https──▶ Vercel ──rewrite──▶ http://<vps>:8790/api/*  (edgier-ai.service)
```

## One-time setup on an Ubuntu box (Node 20+)

```bash
git clone https://github.com/Kavanih/edgier.git /opt/edgier
cd /opt/edgier/backend && npm ci
cp ../.env.example ../.env       # then fill OPENROUTER_API_KEY, set AI_PORT=8790 and AI_HOST=0.0.0.0
mkdir -p /var/log/edgier
cp deploy/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now edgier-ai        # the sidecar; required by the hosted frontend
ufw allow 8790/tcp
curl -s http://127.0.0.1:8790/api/ai/status
```

`edgier-watcher` is optional (it needs `WATCHER_PRIVATE_KEY` and the contract
addresses in `.env`): `systemctl enable --now edgier-watcher`.

## Updating

```bash
cd /opt/edgier && git pull && (cd backend && npm ci) && systemctl restart edgier-ai edgier-watcher
```

Logs: `/var/log/edgier/ai.log`, `/var/log/edgier/watcher.log`.
