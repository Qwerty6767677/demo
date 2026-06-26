import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `คุณคือ "น้องโฟลว์" ผู้ช่วย AI ของ Flowmart แพลตฟอร์มดีลกลุ่มสินค้าราคาส่งจากโรงงาน

บุคลิก:
- พูดเป็นกันเองแบบเพื่อนสนิท ใช้ภาษาไทยธรรมชาติ มีอารมณ์ขัน เป็นมิตร อบอุ่น
- ใช้คำลงท้ายแบบไทย ("ครับ/ค่ะ", "นะ", "เลย", "ดูสิ") สลับให้ฟังลื่น
- ใช้ emoji ประปรายให้น่ารัก (ไม่เกิน 1-2 ตัวต่อข้อความ) เช่น 😊 🛒 ✨ 📦 🏭
- ตอบกระชับเหมือนคุยแชท (2-4 ประโยคพอ) ยกเว้นถูกขอให้อธิบายยาว
- ถ้าผู้ใช้พิมพ์สั้น ตอบสั้น ถ้าผู้ใช้ถามจริงจัง ตอบจริงจัง

ขอบเขตที่ช่วยได้:
- แนะนำสินค้าดีลกลุ่ม วิธีร่วมจอง การชำระเงิน การจัดส่ง
- อธิบาย Trust Score (ยกเลิกบ่อยถูกหักคะแนน)
- ช่วยเลือกสินค้า แนะนำของที่กำลังฮิต
- เล่าเรื่องการกระจายสินค้าจากรถขนส่งโรงงาน
- พูดคุยเรื่องทั่วไปได้ ไม่ต้องเครียด

กฎ:
- ห้ามแต่งราคา/โปรโมชั่นที่ไม่มีจริง ถ้าไม่รู้ให้บอกตรง ๆ และชวนติดต่อทีมงาน
- ห้ามให้คำแนะนำทางการแพทย์/กฎหมาย/การเงินที่จริงจัง
- ถ้าผู้ใช้หงุดหงิด ใช้น้ำเสียงเข้าใจ ไม่โต้กลับ`;

type ChatBody = {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  context?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages, context } = (await request.json()) as ChatBody;
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

          const system = context
            ? `${SYSTEM_PROMPT}\n\n[ข้อมูลผู้ใช้/บริบทปัจจุบัน]\n${String(context).slice(0, 4000)}`
            : SYSTEM_PROMPT;

          const gateway = createLovableAiGatewayProvider(key);
          // หลัก: GPT-5 (ฉลาด เข้าใจภาษาไทยลื่น) — ถ้าโควต้าหมดจะ fallback ไป Gemini Pro
          let text = "";
          try {
            const res = await generateText({
              model: gateway("openai/gpt-5"),
              system,
              messages: safe,
            });
            text = res.text;
          } catch (primaryErr) {
            const err = primaryErr as { statusCode?: number };
            if (err?.statusCode === 429 || err?.statusCode === 402) {
              const res = await generateText({
                model: gateway("google/gemini-2.5-pro"),
                system,
                messages: safe,
              });
              text = res.text;
            } else {
              throw primaryErr;
            }
          }
          return Response.json({ text });
        } catch (e: unknown) {
          const err = e as { statusCode?: number; message?: string };
          const status = err?.statusCode === 429 || err?.statusCode === 402 ? err.statusCode : 500;
          const msg =
            status === 429
              ? "ตอนนี้คนถามเยอะมาก รอแป๊บนึงนะ แล้วลองใหม่อีกที 🙏"
              : status === 402
                ? "เครดิต AI หมดแล้ว รบกวนติดต่อทีมงานเติมให้หน่อยนะ"
                : "ขออภัย น้องโฟลว์งงนิดนึง ลองพิมพ์ใหม่อีกครั้งนะ 😅";
          return Response.json({ error: msg }, { status });
        }
      },
    },
  },
});
