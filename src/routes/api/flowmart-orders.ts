import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type FlowmartOrder = {
  id: string;
  ts: number;
  closesAt: number;
  customerEmail?: string;
  customerName: string;
  contact?: string;
  address: Json;
  category?: string;
  items: Json;
  totalAmount: number;
  depositAmount: number;
  status: "pending" | "closed";
  closedAt?: number | null;
};

function cloudClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function toAppOrder(row: Database["public"]["Tables"]["flowmart_orders"]["Row"]): FlowmartOrder {
  return {
    id: row.id,
    ts: row.ts,
    closesAt: row.closes_at,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    contact: row.contact || "-",
    address: row.address,
    category: row.category || undefined,
    items: row.items,
    totalAmount: row.total_amount,
    depositAmount: row.deposit_amount,
    status: row.status === "closed" ? "closed" : "pending",
    closedAt: row.closed_at,
  };
}

function toDbOrder(order: FlowmartOrder): Database["public"]["Tables"]["flowmart_orders"]["Insert"] {
  return {
    id: String(order.id),
    ts: Number(order.ts || Date.now()),
    closes_at: Number(order.closesAt || Date.now()),
    customer_email: String(order.customerEmail || "guest@flowmart"),
    customer_name: String(order.customerName || "ลูกค้า"),
    contact: String(order.contact || "-"),
    address: order.address,
    category: order.category || null,
    items: order.items,
    total_amount: Number(order.totalAmount || 0),
    deposit_amount: Number(order.depositAmount || 0),
    status: order.status === "closed" ? "closed" : "pending",
    closed_at: order.closedAt || null,
  };
}

export const Route = createFileRoute("/api/flowmart-orders")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await cloudClient()
          .from("flowmart_orders")
          .select("*")
          .order("ts", { ascending: false })
          .limit(500);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ orders: (data || []).map(toAppOrder) });
      },
      POST: async ({ request }) => {
        const order = (await request.json()) as FlowmartOrder;
        const { data, error } = await cloudClient()
          .from("flowmart_orders")
          .upsert(toDbOrder(order), { onConflict: "id" })
          .select("*")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ order: toAppOrder(data) });
      },
      PATCH: async ({ request }) => {
        const order = (await request.json()) as FlowmartOrder;
        if (!order.id) return Response.json({ error: "id required" }, { status: 400 });
        const { data, error } = await cloudClient()
          .from("flowmart_orders")
          .upsert(toDbOrder(order), { onConflict: "id" })
          .select("*")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ order: toAppOrder(data) });
      },
      DELETE: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        const { error } = await cloudClient().from("flowmart_orders").delete().eq("id", id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});