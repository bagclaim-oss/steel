import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Customers ───────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").unique().notNull(),
  email: text("email").notNull(),
  name: text("name"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  plan: text("plan").notNull().default("starter"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Instances ───────────────────────────────────────────────────────────────

export const instances = pgTable("instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .references(() => customers.id, { onDelete: "cascade" })
    .notNull(),
  flyMachineId: text("fly_machine_id").unique(),
  flyVolumeId: text("fly_volume_id"),
  region: text("region").notNull().default("iad"),
  hostname: text("hostname").unique(),
  customDomain: text("custom_domain"),
  machineStatus: text("machine_status").notNull().default("provisioning"),
  authSecret: text("auth_secret").notNull(),
  config: jsonb("config").default({}),
  tailscaleEnabled: boolean("tailscale_enabled").default(false),
  tailscaleHostname: text("tailscale_hostname"),
  hasActiveCrons: boolean("has_active_crons").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Instance Events (audit log) ─────────────────────────────────────────────

export const instanceEvents = pgTable("instance_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .references(() => instances.id, { onDelete: "cascade" })
    .notNull(),
  eventType: text("event_type").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .references(() => customers.id, { onDelete: "cascade" })
    .notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique().notNull(),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
