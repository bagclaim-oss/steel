import { Hono } from "hono";

/**
 * Billing routes for Stripe integration.
 *
 * POST /billing/checkout  — Create Stripe Checkout Session
 * POST /billing/portal    — Create Stripe Customer Portal link
 * POST /webhooks/stripe   — Handle Stripe webhook events
 */

const billing = new Hono();

billing.post("/checkout", async (c) => {
  // TODO: Get customer from session, create Stripe Checkout
  return c.json({ url: "https://checkout.stripe.com/..." });
});

billing.post("/portal", async (c) => {
  // TODO: Get customer's stripe_customer_id, create portal session
  return c.json({ url: "https://billing.stripe.com/..." });
});

export { billing };

// ─── Stripe Webhook Handler ──────────────────────────────────────────────────

export const stripeWebhook = new Hono();

stripeWebhook.post("/stripe", async (c) => {
  // TODO: Verify Stripe signature, handle events:
  // - checkout.session.completed → provision instance
  // - invoice.paid → keep active
  // - invoice.payment_failed → grace period
  // - customer.subscription.deleted → schedule destruction
  return c.json({ received: true });
});
