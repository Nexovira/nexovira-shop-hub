/**
 * Server-only email helpers. Never import this from a component.
 *
 * Sending is intentionally best-effort: a failed notification must never roll
 * back or block a successful payment. Every attempt is recorded in
 * public.admin_notifications so nothing is silently lost.
 */

export const ADMIN_FALLBACK_EMAIL = "nexoviratech@gmail.com";

export function adminEmailRecipient() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || ADMIN_FALLBACK_EMAIL;
}

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type OrderEmailItem = {
  title: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
};

export type OrderEmailData = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  items: OrderEmailItem[];
  subtotal: number;
  shipping: number;
  creditApplied: number;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  paymentMethod: string;
  reference: string;
  transactionId: string;
  orderDate: string;
  adminUrl: string;
};

/** Professional HTML summary of a paid order, for the store administrator. */
export function renderAdminOrderEmail(d: OrderEmailData): string {
  const rows = d.items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eceff4;width:64px;">
          ${
            i.image_url
              ? `<img src="${esc(i.image_url)}" alt="${esc(i.title)}" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:8px;display:block;border:1px solid #eceff4;" />`
              : `<div style="width:56px;height:56px;border-radius:8px;background:#f1f5f9;"></div>`
          }
        </td>
        <td style="padding:12px 12px;border-bottom:1px solid #eceff4;font-size:14px;color:#0f172a;">
          <div style="font-weight:600;">${esc(i.title)}</div>
          <div style="color:#64748b;font-size:12px;">Qty ${esc(i.quantity)} × ${naira(i.unit_price)}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eceff4;text-align:right;font-size:14px;font-weight:600;color:#0f172a;white-space:nowrap;">
          ${naira(i.unit_price * i.quantity)}
        </td>
      </tr>`,
    )
    .join("");

  const line = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#64748b;">${esc(label)}</td>
      <td style="padding:4px 0;font-size:${strong ? "16px" : "13px"};font-weight:${strong ? 700 : 500};color:#0f172a;text-align:right;">${value}</td>
    </tr>`;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f8fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:#0b1220;padding:24px;">
        <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.02em;">NEXOVIRA Global Ventures</div>
        <div style="color:#f59e0b;font-size:13px;margin-top:4px;">New paid order — ${esc(d.orderNumber)}</div>
      </td>
    </tr>
    <tr><td style="padding:24px;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Payment confirmed</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#64748b;">${esc(d.orderDate)}</p>

      <h2 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Customer</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#0f172a;line-height:1.6;">
        <strong>${esc(d.customerName)}</strong><br/>
        ${esc(d.customerEmail)}<br/>
        ${esc(d.customerPhone)}<br/>
        <span style="color:#475569;">${esc(d.address)}</span>
      </p>

      <h2 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Items</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
        ${line("Subtotal", naira(d.subtotal))}
        ${line("Delivery", naira(d.shipping))}
        ${d.creditApplied > 0 ? line("Store credit", `-${naira(d.creditApplied)}`) : ""}
        ${line("Total", naira(d.total), true)}
        ${line("Amount paid", naira(d.amountPaid), true)}
      </table>

      <h2 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Payment</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${line("Status", esc(d.paymentStatus))}
        ${line("Method", esc(d.paymentMethod))}
        ${line("Paystack reference", esc(d.reference))}
        ${line("Transaction ID", esc(d.transactionId))}
      </table>

      <div style="text-align:center;margin-top:28px;">
        <a href="${esc(d.adminUrl)}" style="display:inline-block;background:#f59e0b;color:#0b1220;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:10px;">View order</a>
      </div>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">
      Automated notification from your NEXOVIRA store.
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Dispatch an email through Resend when a key is configured.
 * Returns the delivery outcome instead of throwing.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { status: "skipped", error: "No email provider configured (RESEND_API_KEY missing)" };
  }
  const from = process.env.EMAIL_FROM || "NEXOVIRA Store <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: "failed", error: text.slice(0, 500) };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
