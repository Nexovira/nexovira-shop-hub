import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/** Constant-time compare of two hex signatures. */
function signatureMatches(received: string, expected: string) {
  if (!received || received.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Not configured", { status: 503 });

        const body = await request.text();
        if (body.length > 1_000_000) return new Response("Payload too large", { status: 413 });

        // 1. Verify the HMAC-SHA512 signature over the raw body.
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(body).digest("hex");
        if (!signatureMatches(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: {
          event?: string;
          id?: number | string;
          data?: {
            id?: number | string;
            reference?: string;
            status?: string;
            metadata?: { order_id?: string };
          };
        };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const reference = event.data?.reference ?? null;
        const eventType = event.event ?? "unknown";
        // Paystack does not always send a top-level event id; the transaction id
        // plus the event type is a stable idempotency key for retries.
        const eventId = String(event.id ?? `${eventType}:${event.data?.id ?? reference ?? ""}`);
        if (!eventId || eventId === `${eventType}:`) {
          return new Response("Missing event identifier", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 2. Claim the event. The unique (provider, event_id) index makes this
        //    atomic, so a retry (or two concurrent deliveries) can never process twice.
        const { error: claimError } = await supabaseAdmin
          .from("payment_webhook_events")
          .insert({
            provider: "paystack",
            event_id: eventId,
            event_type: eventType,
            reference,
            order_id: event.data?.metadata?.order_id ?? null,
            payload: event as unknown as Record<string, unknown>,
          });

        if (claimError) {
          // 23505 = unique violation -> already handled, acknowledge quietly.
          if ((claimError as { code?: string }).code === "23505") {
            return new Response("duplicate ignored", { status: 200 });
          }
          console.error("[paystack-webhook] could not record event", claimError.message);
          // Return 500 so Paystack retries later rather than losing the event.
          return new Response("Storage error", { status: 500 });
        }

        // 3. Process. Only successful charges change order state.
        if (eventType === "charge.success" && reference && event.data?.status === "success") {
          const { markOrderPaid } = await import("@/lib/checkout.server");
          let orderId = event.data.metadata?.order_id ?? null;

          if (!orderId) {
            const { data: order } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("paystack_reference", reference)
              .maybeSingle();
            orderId = order?.id ?? null;
          }

          if (orderId) {
            await markOrderPaid(supabaseAdmin, orderId, reference);
          } else {
            console.warn("[paystack-webhook] no order matched reference", reference);
          }
        }

        return new Response("ok");
      },
    },
  },
});
