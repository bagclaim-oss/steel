/**
 * Stripe integration for billing and subscriptions.
 *
 * Handles checkout sessions, customer portal, and webhook events.
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});

// ─── Price IDs (configure in Stripe Dashboard) ──────────────────────────────

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
};

// ─── Checkout ────────────────────────────────────────────────────────────────

export async function createCheckoutSession(opts: {
  customerId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): Promise<string> {
  const priceId = PRICE_IDS[opts.plan];
  if (!priceId) throw new Error(`Unknown plan: ${opts.plan}`);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: opts.customerId || undefined,
    customer_email: opts.customerId ? undefined : opts.customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { plan: opts.plan },
  });

  return session.url!;
}

// ─── Customer Portal ─────────────────────────────────────────────────────────

export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

// ─── Customer ────────────────────────────────────────────────────────────────

export async function createCustomer(
  email: string,
  name?: string,
): Promise<string> {
  const customer = await stripe.customers.create({ email, name });
  return customer.id;
}

// ─── Webhook verification ────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload: string,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export { stripe };
