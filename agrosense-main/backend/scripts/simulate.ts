/**
 * AgroSense telemetry simulator.
 * Posts realistic telemetry to the HTTP endpoint on a loop — no MQTT broker needed.
 *
 * Usage:
 *   npm run sim -- --port 4000 --interval 5 --device AGROSENSE01
 */
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, "");
  const value = process.argv[i + 1];
  if (key && value && !value.startsWith("--")) args.set(key, value);
  else if (key) {
    args.set(key, "true");
    i -= 1;
  }
}

const PORT = Number(args.get("port") ?? 4000);
const DEVICE = args.get("device") ?? "AGROSENSE01";
const INTERVAL_S = Math.min(Math.max(Number(args.get("interval") ?? 5), 1), 300);

const state = {
  temperature: 29.5,
  humidity: 64,
  water_level: 78,
  flow_rate: 1.8,
  zones: [
    { zone_id: 1, soil_moisture: 28, pump_status: true },
    { zone_id: 2, soil_moisture: 52, pump_status: false },
    { zone_id: 3, soil_moisture: 21, pump_status: true },
  ],
};

const drift = (v: number, amt: number, min: number, max: number) =>
  Math.round((Math.min(max, Math.max(min, v + (Math.random() - 0.5) * amt)) + Number.EPSILON) * 10) / 10;

async function tick(n: number) {
  state.temperature = drift(state.temperature, 0.6, 18, 42);
  state.humidity = drift(state.humidity, 3, 20, 95);
  state.water_level = drift(state.water_level, 1.2, 5, 100);
  const activePumps = state.zones.filter((z) => z.pump_status).length;
  state.flow_rate = activePumps ? drift(state.flow_rate, 0.4, 0.5, 4) : 0;
  for (const z of state.zones) {
    // Running pumps raise moisture; idle zones dry out slowly.
    z.soil_moisture = Math.round(
      Math.min(100, Math.max(0, z.soil_moisture + (z.pump_status ? Math.random() * 2 : -Math.random() * 1.2)))
    );
    // Occasionally flip a pump to exercise irrigation events.
    if (Math.random() < 0.08) z.pump_status = !z.pump_status;
  }

  const body = {
    timestamp: new Date().toISOString(),
    system: {
      temperature: state.temperature,
      humidity: Math.round(state.humidity),
      water_level: Math.round(state.water_level),
      rain: Math.random() < 0.03,
      flow_rate: state.flow_rate,
    },
    zones: state.zones,
  };

  try {
    const res = await fetch(`http://localhost:${PORT}/api/v1/devices/${DEVICE}/telemetry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`#${n} ${res.status} temp=${body.system.temperature} tank=${body.system.water_level}% pumps=${state.zones.map((z) => (z.pump_status ? "ON" : "off")).join(",")}`);
  } catch (error) {
    console.error(`#${n} failed: is the backend running on port ${PORT}?`, (error as Error).message);
  }
}

async function main() {
  console.log(`Simulating ${DEVICE} → http://localhost:${PORT} every ${INTERVAL_S}s (Ctrl+C to stop)`);
  let n = 0;
  await tick(++n);
  setInterval(() => void tick(++n), INTERVAL_S * 1000);
}

void main();
