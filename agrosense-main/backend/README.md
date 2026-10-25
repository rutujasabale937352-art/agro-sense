# AgroSense backend

Express + TypeScript backend for the AgroSense irrigation dashboard. Local-only: plain Express + Socket.IO, no production middleware.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

The API starts at `http://localhost:4000`.

## Endpoints

```text
GET  /api/v1/health
GET  /api/v1/ready                                   # { database, mqtt: { enabled, connected, pending } }
GET  /api/v1/dashboard/summary?device_id=
GET  /api/v1/devices/:deviceId/latest
POST /api/v1/devices/:deviceId/telemetry
GET  /api/v1/zones?device_id=
PUT  /api/v1/devices/:deviceId/zones/:zoneId/settings
POST /api/v1/devices/:deviceId/zones/:zoneId/pump     # { action: on|off } → 409 when a safety guard blocks
GET  /api/v1/devices/:deviceId/commands/pending
GET/PUT /api/v1/devices/:deviceId/mode                # { mode: auto|manual }
GET  /api/v1/irrigation/history[.csv]                 # ?zone_id=&trigger=&limit=
GET  /api/v1/irrigation/stats
GET  /api/v1/alerts                                   # ?unread_only=&limit=
PATCH /api/v1/alerts/:id/read
POST /api/v1/alerts/read-all
GET  /api/v1/plants/analysis
```

The backend starts with sample telemetry. The HTTP telemetry endpoint is intended for simulator development; ESP32 devices should publish through MQTT.

## Automatic watering

Devices in `auto` mode water themselves: zones below their dry threshold start (tank ≥ 15%, no rain), saturated zones stop. Manual commands hold a zone for 30 minutes so auto and manual never fight. Safety guards (low tank, rain, 60-minute runaway cap) are enforced in both paths.

## MQTT contract

Set `MQTT_ENABLED=true` in `.env`. The backend subscribes to:

```text
agrosense/{device_id}/telemetry
agrosense/{device_id}/commands/ack
```

and publishes pump commands to `agrosense/{device_id}/commands` (`{request_id, zone_id, action, trigger, issued_at}`, QoS 1). Devices ack with `{request_id, zone_id, action, ok, message}`. Publish JSON matching the sample in the project specification. The backend validates every message before accepting it.

Socket.IO events:

```text
telemetry:update
dashboard:summary
alerts:update
irrigation:update
command:update
```

## Simulator and tests

```bash
npm run sim -- --port 4000 --interval 5 --device AGROSENSE01
npm test   # node:test — irrigation, alerts, API interlocks (13 tests)
```

## Database

If `DATABASE_URL` is configured, the backend creates the telemetry, irrigation, alerts, and control tables, writes incoming readings to PostgreSQL, and hydrates state on startup. Without it, the API safely falls back to the in-memory seeded store. `prisma/schema.prisma` is retained as a reference model for future migration tooling; the current runtime persistence path uses `pg` and SQL initialization.
