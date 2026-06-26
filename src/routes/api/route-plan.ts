import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const FACTORY = { lat: 14.0708, lon: 100.6147, name: "ฮับโรงงาน ปทุมธานี" };

type Stop = { id: string; name: string; address: string };
type Body = { origin?: string; stops?: Stop[] };

type Geo = { lat: number; lng: number; formatted: string };

async function geocode(addr: string, headers: HeadersInit): Promise<Geo | null> {
  const r = await fetch(
    `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=th&language=th`,
    { headers },
  );
  const j = (await r.json()) as {
    status?: string;
    results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
  };
  if (!r.ok || j.status !== "OK" || !j.results?.length) return null;
  const g = j.results[0];
  return { lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371,
    toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat),
    dLon = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function routeLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  headers: HeadersInit,
): Promise<{ km: number; sec: number } | null> {
  const r = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      regionCode: "TH",
      languageCode: "th",
    }),
  });
  const j = (await r.json()) as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
  if (!r.ok || !j.routes?.length) return null;
  const m = j.routes[0];
  return { km: (m.distanceMeters ?? 0) / 1000, sec: Number((m.duration ?? "0s").replace("s", "")) || 0 };
}

export const Route = createFileRoute("/api/route-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { stops = [] } = (await request.json()) as Body;
          if (!Array.isArray(stops) || stops.length === 0) {
            return Response.json({ error: "stops required" }, { status: 400 });
          }
          if (stops.length > 20) {
            return Response.json({ error: "เกิน 20 จุด ต่อรอบ" }, { status: 400 });
          }

          const LOVABLE = process.env.LOVABLE_API_KEY;
          const GKEY = process.env.GOOGLE_MAPS_API_KEY;
          if (!LOVABLE || !GKEY) {
            return Response.json({ error: "Google Maps connector not configured" }, { status: 500 });
          }
          const headers = { Authorization: `Bearer ${LOVABLE}`, "X-Connection-Api-Key": GKEY };

          // 1) Geocode ทุกจุด (parallel)
          const geos = await Promise.all(
            stops.map(async (s) => ({ stop: s, geo: await geocode(s.address, headers) })),
          );
          const failed = geos.filter((g) => !g.geo).map((g) => g.stop.name || g.stop.id);
          const ok = geos.filter((g): g is { stop: Stop; geo: Geo } => !!g.geo);
          if (ok.length === 0) {
            return Response.json({ error: `หาพิกัดที่อยู่ไม่พบ: ${failed.join(", ")}` }, { status: 422 });
          }

          // 2) จัดลำดับด้วย nearest-neighbor ใช้ haversine (เร็ว) แล้วค่อยคิดระยะจริงทีหลัง
          const start = { lat: FACTORY.lat, lng: FACTORY.lon };
          const remaining = [...ok];
          const order: typeof ok = [];
          let cur = start;
          while (remaining.length) {
            let bi = 0,
              bd = Infinity;
            remaining.forEach((s, i) => {
              const d = haversineKm(cur, s.geo);
              if (d < bd) { bd = d; bi = i; }
            });
            const next = remaining.splice(bi, 1)[0];
            order.push(next);
            cur = next.geo;
          }

          // 3) คำนวณระยะ/เวลา "จริง" แต่ละ leg (parallel)
          const legPoints: Array<{ from: { lat: number; lng: number }; to: { lat: number; lng: number } }> = [];
          let prev = start;
          for (const s of order) {
            legPoints.push({ from: prev, to: s.geo });
            prev = s.geo;
          }
          legPoints.push({ from: prev, to: start }); // กลับฮับ

          const legs = await Promise.all(legPoints.map((p) => routeLeg(p.from, p.to, headers)));

          const stopsOut = order.map((s, i) => {
            const leg = legs[i];
            return {
              id: s.stop.id,
              name: s.stop.name,
              address: s.stop.address,
              formattedAddress: s.geo.formatted,
              lat: s.geo.lat,
              lng: s.geo.lng,
              legKm: leg ? +leg.km.toFixed(1) : null,
              legSec: leg ? leg.sec : null,
            };
          });
          const returnLeg = legs[legs.length - 1];

          const totalKm = legs.reduce((a, b) => a + (b?.km ?? 0), 0);
          const totalSec = legs.reduce((a, b) => a + (b?.sec ?? 0), 0);
          const fuelLiters = +(totalKm / 8).toFixed(1);
          const fuelBaht = Math.round((totalKm / 8) * 32);

          return Response.json({
            origin: { lat: FACTORY.lat, lng: FACTORY.lon, name: FACTORY.name },
            stops: stopsOut,
            returnKm: returnLeg ? +returnLeg.km.toFixed(1) : null,
            returnSec: returnLeg ? returnLeg.sec : null,
            totalKm: +totalKm.toFixed(1),
            totalSec,
            fuelLiters,
            fuelBaht,
            failed,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "route plan error";
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
