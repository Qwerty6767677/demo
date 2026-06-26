import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const FACTORY = { lat: 14.0708, lon: 100.6147 };

type Body = {
  address?: string;          // ที่อยู่เต็มของลูกค้า
  subtotal?: number;         // ยอดสินค้ารวม (สำหรับฟรีค่าส่ง)
};

function feeFromKm(km: number) {
  if (km <= 15) return 39;
  if (km <= 40) return 69;
  if (km <= 90) return 109;
  if (km <= 180) return 149;
  if (km <= 350) return 199;
  if (km <= 600) return 259;
  return 299;
}

export const Route = createFileRoute("/api/shipping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { address, subtotal = 0 } = (await request.json()) as Body;
          const addr = String(address || "").trim();
          if (!addr) return Response.json({ error: "address required" }, { status: 400 });

          const LOVABLE = process.env.LOVABLE_API_KEY;
          const GKEY = process.env.GOOGLE_MAPS_API_KEY;
          if (!LOVABLE || !GKEY) {
            return Response.json({ error: "Google Maps connector not configured" }, { status: 500 });
          }
          const headers = {
            Authorization: `Bearer ${LOVABLE}`,
            "X-Connection-Api-Key": GKEY,
          };

          // 1) Geocode ที่อยู่ลูกค้า → lat/lng จริง
          const geoRes = await fetch(
            `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=th&language=th`,
            { headers },
          );
          const geo = (await geoRes.json()) as {
            status?: string;
            results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
            error_message?: string;
          };
          if (!geoRes.ok || geo.status !== "OK" || !geo.results?.length) {
            return Response.json(
              { error: `geocode failed: ${geo.status || geoRes.status} ${geo.error_message || ""}`.trim() },
              { status: 502 },
            );
          }
          const loc = geo.results[0].geometry.location;
          const formatted = geo.results[0].formatted_address;

          // 2) Routes API: ระยะทาง/เวลาขับรถจริง
          const routeRes = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
              "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
            },
            body: JSON.stringify({
              origin: { location: { latLng: { latitude: FACTORY.lat, longitude: FACTORY.lon } } },
              destination: { location: { latLng: { latitude: loc.lat, longitude: loc.lng } } },
              travelMode: "DRIVE",
              routingPreference: "TRAFFIC_AWARE",
              regionCode: "TH",
              languageCode: "th",
            }),
          });
          const route = (await routeRes.json()) as {
            routes?: Array<{ distanceMeters?: number; duration?: string }>;
            error?: { message?: string };
          };
          if (!routeRes.ok || !route.routes?.length) {
            return Response.json(
              { error: `route failed: ${routeRes.status} ${route.error?.message || ""}`.trim() },
              { status: 502 },
            );
          }
          const meters = route.routes[0].distanceMeters ?? 0;
          const km = meters / 1000;
          const durationSec = Number((route.routes[0].duration ?? "0s").replace("s", "")) || 0;

          // 3) คิดค่าส่ง (มีฟรีค่าส่งเมื่อยอดถึง 3,000)
          const free = subtotal >= 3000;
          const fee = free ? 0 : feeFromKm(km);

          return Response.json({
            km: +km.toFixed(1),
            meters,
            durationSec,
            durationText: `${Math.floor(durationSec / 3600)} ชม. ${Math.round((durationSec % 3600) / 60)} น.`,
            fee,
            free,
            formattedAddress: formatted,
            origin: FACTORY,
            destination: { lat: loc.lat, lon: loc.lng },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "shipping error";
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
