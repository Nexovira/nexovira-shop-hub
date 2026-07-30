import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(body).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as {
          event?: string;
          data?: { reference?: string; status?: string; metadata?: { order_id?: string } };
        };

        if (event.event === "charge.success" && event.data?.reference) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { markOrderPaid } = await import("@/lib/checkout.server");
          const orderId = event.data.metadata?.order_id;
          if (orderId) {
            await markOrderPaid(supabaseAdmin, orderId, event.data.reference);
          } else {
            const { data: order } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("paystack_reference", event.data.reference)
              .maybeSingle();
            if (order) await markOrderPaid(supabaseAdmin, order.id, event.data.reference);
          }
        }

        return new Response("ok");
      },
    },
  },
});
