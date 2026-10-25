# AgroSense

AgroSense is a smart irrigation monitoring and control platform. An ESP32 reads farm sensors over Wi-Fi, the Express backend validates and distributes telemetry, and the React dashboard presents live irrigation and plant data.

This README is the single project reference for the current implementation. The supplied structure PDF is treated as a product and design reference, not as additional instructions overriding the user's request.

## Start the project

The backend and frontend run in separate terminals.

### Terminal 1: backend

~~~bash
cd backend
cp .env.example .env
npm install
npm run dev
~~~

The Express API runs at http://localhost:4000.

### Terminal 2: frontend

~~~bash
cd frontend
cp .env.example .env
npm install
npm run dev
~~~

Open the dashboard at http://localhost:5173.

### Production build

~~~bash
cd backend
npm run typecheck
npm run build
npm start
~~~

~~~bash
cd frontend
npm run typecheck
npm run build
npm run preview
~~~

The backend can start without PostgreSQL or MQTT. It uses seeded in-memory telemetry until those services are configured.

## Project at a glance

| Area | Choice |
| --- | --- |
| Product | IoT-enabled smart irrigation dashboard |
| Device | ESP32 sensor/controller sending telemetry over Wi-Fi |
| Frontend | React, TypeScript, Vite, local shadcn-style UI primitives, Lucide icons |
| Backend | Node.js, Express, TypeScript, Socket.IO, MQTT.js, Zod |
| Persistence | PostgreSQL through pg, with an in-memory development fallback |
| Device protocol | MQTT |
| Live UI protocol | Socket.IO |
| Backend port | 4000 |
| Frontend port | 5173 |

## Product scope

The product structure includes these modules:

- Login: user login, password visibility, remember-me, forgot-password, and optional Google login treatment.
- Dashboard: temperature, humidity, water level, rain status, flow rate, zone moisture, pumps, water usage, and system status.
- Live Sensor Data: real-time readings, moisture trends, sensor status, tank status, and rain status.
- Zones: independent monitoring for Zone 1, Zone 2, and Zone 3, including crops, pumps, trends, comparison, and irrigation details.
- System Control: automatic/manual modes, zone pump control, moisture thresholds, schedules, flow monitoring, and water-tank status.
- Irrigation History: event history, moisture before/after, duration, water used, pump status, filters, and charts.
- Plant Analysis: plant health, growth stage, recommended moisture, environmental conditions, plant response, water fingerprint, and recommendations.
- Alerts: low moisture, high temperature, low water, rain, pump, offline, and system alerts with settings and history.
- Settings: device ID, Wi-Fi settings, thresholds, notifications, preferences, data management, and save settings.

## Architecture

~~~text
ESP32 sensors / pumps
        | Wi-Fi + MQTT
        v
Express backend
  |-- MQTT ingestion and validation
  |-- PostgreSQL write-through
  |-- Alert and irrigation services
  |-- Socket.IO live updates
        v
React dashboard
~~~

MQTT is recommended for device-to-backend telemetry because it is lightweight, reconnectable, and suitable for continuous sensor messages.

## Repository structure

~~~text
backend/
  src/config              Environment parsing
  src/middleware          Express error handling
  src/routes              Versioned API routes
  src/services            Telemetry store and MQTT service
  src/types               Shared telemetry types
  src/validation          Zod schemas
  prisma/schema.prisma    Reference application data model

frontend/
  src/components/ui       Local shadcn-style primitives
  src/App.tsx             Dashboard and navigation shell
  src/api.ts              REST client
  src/styles.css          AgroSense visual system and layout
  components.json         shadcn component configuration
~~~

## Frontend

Modern Tailwind + Recharts dashboard (React 19, Vite 8, TypeScript 5.9):

- Design system: Tailwind v4 theme (`forest` sidebar, `brand` emerald) + local shadcn-style primitives (Button, Card, Badge, Avatar, Progress, Separator, Skeleton) in `frontend/src/components/ui/`
- Data layer: `src/config/env.ts` (Zod-validated `VITE_*`), `src/api.ts` (8s timeout + single retry + typed `ApiError`), `src/hooks/useDashboard.ts` (REST + Socket.IO with backoff)
- Resilience: `ErrorBoundary`, `DashboardSkeleton`, inline error banner with Retry, empty states everywhere
- Dashboard (`src/components/dashboard/`): 5 metric cards with safety alerts (heat / low tank / pump-on-no-flow), zone cards (Mango/Tomato/Chili), Recharts moisture bars (lazy), pump donut (lazy), system status, water-usage empty state, sustainability banner
- Shell (`src/components/layout/`): collapsible sidebar with `aria-current`, sticky topbar with connection pill, notifications, admin chip
- Other modules (`src/components/modules/ModulePage.tsx`): Live Data table + Zones grid render live data; History/Analysis/Control/Settings show honest “next slice” states with live context; Alerts derives warnings from the latest reading
- Quality: pinned deps, `npm run lint` (ESLint), `npm run format`, `typecheck` + `build` green

Implemented dashboard content includes:

- Connection status
- Temperature, humidity, water level, rain status, and flow rate cards
- Soil moisture by zone
- Water usage status panel with an explicit empty state until irrigation events are recorded
- Moisture trend chart
- Pump status donut
- System status panel
- Sustainability banner
- Responsive navigation and layout

## Environment configuration

### Backend: backend/.env

| Variable | Default / example | Purpose |
| --- | --- | --- |
| PORT | 4000 | Express API port |
| CLIENT_ORIGIN | http://localhost:5173 | Allowed frontend origin |
| DATABASE_URL | empty | PostgreSQL connection string; empty enables in-memory fallback |
| MQTT_ENABLED | false | Enable ESP32 MQTT ingestion |
| MQTT_URL | mqtt://localhost:1883 | MQTT broker address |
| MQTT_USERNAME | empty | Optional broker username |
| MQTT_PASSWORD | empty | Optional broker password |
| MQTT_TOPIC_PREFIX | agrosense | MQTT topic namespace |

### Frontend: frontend/.env

~~~env
VITE_API_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000
~~~

## Telemetry contract

The backend accepts a device ID, system readings, and one or more zone readings. The timestamp is optional; the backend assigns the current time when omitted.

~~~json
{
  "device_id": "AGROSENSE01",
  "timestamp": "2026-09-07T10:30:00Z",
  "system": {
    "temperature": 29.5,
    "humidity": 64,
    "water_level": 78,
    "rain": false,
    "flow_rate": 1.8
  },
  "zones": [
    { "zone_id": 1, "soil_moisture": 28, "pump_status": true },
    { "zone_id": 2, "soil_moisture": 52, "pump_status": false },
    { "zone_id": 3, "soil_moisture": 21, "pump_status": true }
  ]
}
~~~

## Express API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/v1/health | Service health check |
| GET | /api/v1/dashboard/summary | Latest dashboard summary + today water usage, unread alerts, control mode |
| GET | /api/v1/devices/:deviceId/latest | Latest raw telemetry for a device |
| POST | /api/v1/devices/:deviceId/telemetry | Validated HTTP telemetry simulator/fallback endpoint |
| GET | /api/v1/zones?device_id= | Zone details with crop, thresholds, live moisture, health |
| PUT | /api/v1/devices/:deviceId/zones/:zoneId/settings | Update crop / moisture_min / moisture_max |
| POST | /api/v1/devices/:deviceId/zones/:zoneId/pump | Manual pump on/off with safety interlocks (409 when blocked) |
| GET/PUT | /api/v1/devices/:deviceId/mode | Get / set auto/manual control mode |
| GET | /api/v1/irrigation/history | Filterable events + stats (zone_id, trigger, limit) |
| GET | /api/v1/irrigation/history.csv | CSV export of irrigation events |
| GET | /api/v1/irrigation/stats | Today/total water usage, per-zone breakdown |
| GET | /api/v1/alerts | Alert list + unread count (unread_only, limit) |
| PATCH | /api/v1/alerts/:id/read | Acknowledge one alert |
| POST | /api/v1/alerts/read-all | Acknowledge all for a device |
| GET | /api/v1/plants/analysis | Rule-based plant health, growth stage, recommendations |

Example telemetry test:

~~~bash
curl -X POST http://localhost:4000/api/v1/devices/AGROSENSE01/telemetry \
  -H 'content-type: application/json' \
  --data @backend/telemetry.example.json
~~~

Invalid telemetry returns HTTP 400 with validation details.

## ESP32 and MQTT integration

Set MQTT_ENABLED=true in backend/.env when the broker is available. The backend subscribes to:

~~~text
agrosense/{device_id}/telemetry
~~~

The ESP32 should:

- Read soil moisture for each zone.
- Read temperature and humidity.
- Read water level, rain status, and flow rate.
- Report pump states.
- Publish validated JSON telemetry periodically.
- Reconnect automatically after Wi-Fi loss.

Pump commands use separate command and acknowledgement topics:

~~~text
agrosense/{device_id}/commands
agrosense/{device_id}/commands/ack
~~~

`POST /devices/:deviceId/zones/:zoneId/pump` publishes `{request_id, zone_id, action, trigger, issued_at}` (QoS 1) when `MQTT_ENABLED=true` and tracks acks (10s timeout) at `GET /devices/:deviceId/commands/pending`. The dashboard shows delivery (`sent` / `offline` / `disabled`) and live `command:update` socket acks. ESP32 firmware should subscribe to `commands`, enforce the same safety interlocks locally, and publish `{request_id, zone_id, action, ok, message}` to `commands/ack`.

Socket.IO events sent to the dashboard:

~~~text
telemetry:update
dashboard:summary
alerts:update
irrigation:update
~~~

Pump safety interlocks (backend-enforced):

- Tank below 15% blocks pump-start (HTTP 409).
- Auto mode blocks pump-start while raining (switch to manual to override with warning).
- Events running over 60 minutes auto-close as a runaway-pump guard.
- Pump ON with 0 L/min flow raises a critical pump-anomaly alert.

### Hardware safety requirement

The ESP32 should enforce local safety rules for:

- Low tank level
- Missing or abnormal flow
- Maximum pump duration
- Conflicting pump commands
- Temporary internet loss

Physical safety must not depend entirely on cloud connectivity.

## Persistence

If DATABASE_URL is configured, the backend:

1. Creates the telemetry tables if needed.
2. Writes system and zone readings to PostgreSQL.
3. Updates device and zone state.
4. Hydrates the latest readings on startup.

If PostgreSQL is unavailable or DATABASE_URL is empty, the backend logs the fallback and continues with seeded in-memory telemetry.

backend/prisma/schema.prisma is retained as a reference application data model. The current runtime persistence path uses pg and SQL initialization.

## Current implementation status

| Area | Status | Notes |
| --- | --- | --- |
| Express backend | Implemented | TypeScript, validation, health, dashboard summary, telemetry endpoint |
| MQTT gateway | Implemented | Disabled by default; validates ESP32 payloads and broadcasts updates |
| PostgreSQL write-through | Implemented | Telemetry + irrigation_events + alerts + device_control tables when DATABASE_URL is set |
| React dashboard | Implemented | Dashboard shell, live connection state, cards, charts, zones, status panels |
| Zones + control | Implemented | Zone details, thresholds editing, auto/manual mode, pump toggles with interlocks, auto-watering engine with 30-min manual hold |
| Irrigation history | Implemented | Event tracking from pump transitions, stats, filters, CSV export |
| Alerts | Implemented | Rule engine on every ingest, 15-min dedupe (acks stick), unread counts, ack, offline detection, live socket updates |
| Plant analysis | Implemented | Rule-based health scores, growth stage, recommendations per zone |
| Live data + settings | Implemented | Session trend buffer, sensor status, device info, local notification prefs |
| Authentication | Planned | Login is in the product scope; protected auth routes are not implemented yet |
| Real hardware validation | Pending | Use an MQTT simulator before connecting physical pumps; ESP32 command topics still future |

## Recommended build sequence

1. Confirm local setup with the seeded dashboard and HTTP telemetry endpoint.
2. Run an MQTT broker and replace HTTP simulator messages with ESP32 telemetry.
3. Connect PostgreSQL and verify telemetry hydration after backend restart.
4. Implement authentication and protected routes.
5. Build zones and safe manual/automatic irrigation control.
6. Add irrigation history and CSV export.
7. Add the alert rules engine and notification preferences.
8. Build plant analysis from rule-based insights, then consider predictive models after historical data exists.
9. Test device failure, stale data, low tank, rain, abnormal flow, and Wi-Fi loss scenarios.
10. Deploy with HTTPS, managed PostgreSQL, an MQTT broker, and application monitoring.

## Local setup notes

- Plain Express + Socket.IO app, no production middleware. Just `npm install` and run.
- `GET /api/v1/ready` reports `{database, mqtt:{enabled, connected, pending}}`; unknown routes return JSON 404.

## Telemetry simulator

No hardware or broker needed for UI work:

~~~bash
cd backend
npm run sim -- --port 4000 --interval 5 --device AGROSENSE01
~~~

## Backend tests

~~~bash
cd backend
npm test   # node:test — irrigation, alerts, API interlocks (12 tests)
~~~

## Verification checklist

- backend npm run typecheck passes.
- backend npm run build passes.
- backend npm test passes (13/13).
- frontend npm run typecheck passes.
- frontend npm run lint passes (0 errors).
- frontend npm run build passes.
- GET /api/v1/health returns status ok; /ready reports database + mqtt.
- Valid telemetry updates the dashboard summary.
- Invalid telemetry returns HTTP 400.
- Pump safety blocks return HTTP 409 (low tank, auto+rain).
- PostgreSQL fallback keeps local development usable without a database.
- Frontend connects through REST and Socket.IO (`dashboard:summary`, `telemetry:update`, `alerts:update`, `irrigation:update`, `command:update`).

## Troubleshooting

### Port already in use

The backend uses port 4000 and the frontend uses port 5173 by default. Stop the existing process or change the relevant configuration before starting another instance.

### Dashboard shows offline

Start the backend, confirm VITE_API_URL and VITE_SOCKET_URL, and submit telemetry. The in-memory store marks a device offline when its latest reading is more than five minutes old.

### PostgreSQL is unavailable

Leave DATABASE_URL empty for local UI work. The backend falls back to seeded in-memory telemetry.

### MQTT is unavailable

Leave MQTT_ENABLED=false and use the HTTP telemetry endpoint while the broker or ESP32 is not ready.

## Related project guide

The formatted project guide is available at [docs/AgroSense_Project_Documentation.docx](docs/AgroSense_Project_Documentation.docx).
