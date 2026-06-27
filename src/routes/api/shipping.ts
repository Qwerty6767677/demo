import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const FACTORY = { lat: 14.0708, lon: 100.6147 };

type Body = {
  address?: string;          // ที่อยู่เต็มของลูกค้า
  detail?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  zipcode?: string;
  zip?: string;
  subtotal?: number;         // ยอดสินค้ารวม (สำหรับฟรีค่าส่ง)
};

type AddressComponent = { long_name: string; short_name?: string; types: string[] };
type GeoResult = {
  geometry: { location: { lat: number; lng: number }; location_type?: string };
  formatted_address: string;
  address_components?: AddressComponent[];
  partial_match?: boolean;
};

function normalizeThaiArea(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/กรุงเทพฯ|กทม\.?/g, "กรุงเทพมหานคร")
    .replace(/จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง|ประเทศไทย|รหัสไปรษณีย์/g, "")
    .replace(/[\s,./()\-]+/g, "")
    .toLowerCase();
}

function sameArea(expected: unknown, actual: unknown) {
  const e = normalizeThaiArea(expected);
  const a = normalizeThaiArea(actual);
  return Boolean(e && a && (e === a || e.includes(a) || a.includes(e)));
}

function uniq(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function component(comps: AddressComponent[] = [], type: string) {
  return comps.find((c) => c.types.includes(type))?.long_name || "";
}

function componentsByType(comps: AddressComponent[] = [], types: string[]) {
  return uniq(comps.filter((c) => types.some((t) => c.types.includes(t))).map((c) => c.long_name));
}

function extractArea(result: GeoResult) {
  const comps = result.address_components || [];
  const province = component(comps, "administrative_area_level_1");
  const postalCode = component(comps, "postal_code");
  const districtCandidates = componentsByType(comps, [
    "administrative_area_level_2",
    "locality",
    "sublocality_level_1",
  ]);
  const subdistrictCandidates = componentsByType(comps, [
    "administrative_area_level_3",
    "sublocality_level_2",
    "neighborhood",
  ]);
  return {
    province,
    district: districtCandidates[0] || "",
    subdistrict: subdistrictCandidates[0] || "",
    postalCode,
    districtCandidates,
    subdistrictCandidates,
  };
}

function textHasArea(text: string, value: string) {
  const t = normalizeThaiArea(text);
  const v = normalizeThaiArea(value);
  return Boolean(t && v && t.includes(v));
}

function areaMatches(result: GeoResult, expected: Required<Pick<Body, "detail" | "subdistrict" | "district" | "province">> & { zip: string }) {
  const area = extractArea(result);
  const formatted = result.formatted_address || "";
  const provinceOk = sameArea(expected.province, area.province) || textHasArea(formatted, expected.province);
  const districtOk = area.districtCandidates.some((d) => sameArea(expected.district, d)) || textHasArea(formatted, expected.district);
  const subdistrictOk = area.subdistrictCandidates.some((d) => sameArea(expected.subdistrict, d)) || textHasArea(formatted, expected.subdistrict);
  const zipOk = !expected.zip || !area.postalCode || String(area.postalCode).trim() === String(expected.zip).trim();
  const qualityPenalty = result.partial_match || result.geometry.location_type === "APPROXIMATE" ? 10 : 0;
  const score = (provinceOk ? 35 : 0) + (districtOk ? 25 : 0) + (subdistrictOk ? 20 : 0) + (zipOk ? 20 : 0) - qualityPenalty;
  return { area, provinceOk, districtOk, subdistrictOk, zipOk, score };
}

function areaMismatchMessage(expected: { province?: string; district?: string; subdistrict?: string; zip?: string }, found?: ReturnType<typeof extractArea>) {
  const parts: string[] = [];
  if (expected.province && found?.province && !sameArea(expected.province, found.province)) parts.push(`จังหวัดที่กรอก “${expected.province}” แต่แผนที่พบ “${found.province}”`);
  if (expected.district && found?.district && !sameArea(expected.district, found.district)) parts.push(`อำเภอ/เขตที่กรอก “${expected.district}” แต่พบ “${found.district}”`);
  if (expected.subdistrict && found?.subdistrict && !sameArea(expected.subdistrict, found.subdistrict)) parts.push(`ตำบล/แขวงที่กรอก “${expected.subdistrict}” แต่พบ “${found.subdistrict}”`);
  if (expected.zip && found?.postalCode && String(expected.zip).trim() !== String(found.postalCode).trim()) parts.push(`รหัสไปรษณีย์ที่กรอก “${expected.zip}” แต่พบ “${found.postalCode}”`);
  return parts.length
    ? `พื้นที่ไม่ตรงกัน: ${parts.join(" · ")} — กรุณาแก้ข้อมูลพื้นที่ให้ตรงกับที่อยู่จริง`
    : "พื้นที่ยังไม่ชัดเจน — กรุณากรอกบ้านเลขที่/ถนน ตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ให้ละเอียดขึ้น";
}

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
          const body = (await request.json()) as Body;
          const { subtotal = 0 } = body;
          const detail = String(body.detail || "").trim();
          const subdistrict = String(body.subdistrict || "").trim();
          const district = String(body.district || "").trim();
          const province = String(body.province || "").trim().replace(/^จังหวัด/, "");
          const zip = String(body.zipcode || body.zip || "").trim();
          const structured = Boolean(detail || subdistrict || district || province || zip);
          if (structured) {
            const missing = [
              !detail && "บ้านเลขที่/ถนน",
              !subdistrict && "ตำบล/แขวง",
              !district && "อำเภอ/เขต",
              !province && "จังหวัด",
              !zip && "รหัสไปรษณีย์",
            ].filter(Boolean);
            if (missing.length) {
              return Response.json({ code: "incomplete_address", error: `กรอกข้อมูลที่อยู่ให้ครบ: ${missing.join(", ")}` }, { status: 400 });
            }
          }
          const addr = structured
            ? [detail, subdistrict, district, province, zip, "ประเทศไทย"].filter(Boolean).join(" ")
            : String(body.address || "").trim();
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
            results?: GeoResult[];
            error_message?: string;
          };
          if (!geoRes.ok || geo.status !== "OK" || !geo.results?.length) {
            return Response.json(
              { error: `geocode failed: ${geo.status || geoRes.status} ${geo.error_message || ""}`.trim() },
              { status: 502 },
            );
          }
          let chosen = geo.results[0];
          let check: ReturnType<typeof areaMatches> | null = null;
          if (structured) {
            const expected = { detail, subdistrict, district, province, zip };
            const checked = geo.results.map((result) => ({ result, check: areaMatches(result, expected) }))
              .sort((a, b) => b.check.score - a.check.score);
            const best = checked[0];
            if (!best || best.check.score < 80 || !best.check.provinceOk || !best.check.districtOk || !best.check.subdistrictOk || !best.check.zipOk) {
              return Response.json({
                code: "area_mismatch",
                error: areaMismatchMessage(expected, best?.check.area),
                message: areaMismatchMessage(expected, best?.check.area),
                expected,
                found: best?.check.area || null,
                matchedAddress: best?.result.formatted_address || null,
              }, { status: 422 });
            }
            chosen = best.result;
            check = best.check;
          }
          const loc = chosen.geometry.location;
          const formatted = chosen.formatted_address;

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
            areaCheck: check ? {
              confidence: check.score >= 95 ? "high" : "medium",
              found: check.area,
              matched: {
                province: check.provinceOk,
                district: check.districtOk,
                subdistrict: check.subdistrictOk,
                zipcode: check.zipOk,
              },
            } : null,
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
