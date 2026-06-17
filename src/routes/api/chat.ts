import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `คุณคือ "น้องโฟลว์" ผู้ช่วย AI ของ Flowmart แพลตฟอร์มดีลกลุ่มสินค้าราคาส่งจากโรงงาน ตอบเป็นภาษาไทยอย่างเป็นมิตร กระชับ ไม่ยืดเยื้อ (ไม่เกิน 3-4 ประโยคต่อข้อความ ยกเว้นจำเป็น)

ขอบเขตที่ช่วยได้:
- แนะนำสินค้าดีลกลุ่ม วิธีร่วมจอง การชำระเงิน
- อธิบายระบบ Trust Score (คะแนนความน่าเชื่อถือ) — ยกเลิกบ่อยจะถูกหักคะแนน
- ที่อยู่จัดส่ง พิกัดจังหวัด การกระจายสินค้าจากรถขนส่งโรงงาน
- ตอบคำถามทั่วไปอื่นๆ ที่ลูกค้าถาม

ถ้าไม่ทราบข้อมูลเฉพาะของร้าน ให้บอกตามตรงและแนะนำให้ติดต่อทีมงาน`;

type ChatBody = {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = (await request.json()) as ChatBody;
          if (!Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: "messages required" }, { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return Response.json({ error: "Missing LOVABLE_API_KEY" }, { status: 500 });
          }

          const safe = messages.slice(-20).map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: String(m.content ?? "").slice(0, 2000),
          }));

          const gateway = createLovableAiGatewayProvider(key);
          const { text } = await generateText({
            model: gateway("google/gemini-3-flash-preview"),
            system: SYSTEM_PROMPT,
            messages: safe,
          });
          return Response.json({ text });
        } catch (e: unknown) {
          const err = e as { statusCode?: number; message?: string };
          const status = err?.statusCode === 429 || err?.statusCode === 402 ? err.statusCode : 500;
          const msg =
            status === 429
              ? "มีคำขอเข้ามามากเกินไป กรุณาลองใหม่อีกครั้งในอีกครู่"
              : status === 402
                ? "เครดิต AI ของระบบหมดแล้ว กรุณาติดต่อผู้ดูแล"
                : "ขออภัย ผู้ช่วย AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง";
          return Response.json({ error: msg }, { status });
        }
      },
    },
  },
});
