/**
 * billing-create-portal-session.js — Stripe customer portal session foundation.
 *
 * Mirrors the billing-create-checkout pattern:
 * - When billing env vars are missing or BILLING_ENABLED is not "true",
 *   returns a non-fatal { billing_enabled: false } response.
 * - When enabled, creates a short-lived Stripe Billing Portal session for
 *   the authenticated user.
 */

const { allowOrigin, json, logTelemetry } = require("./lib/sc-auth-lib.js");
const { getJwtUser } = require("./lib/sc-supabase-cjs.js");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

function buildReqFromEvent(event) {
  const headers = event.headers || {};
  return {
    headers: {
      get: (name) => {
        const k = Object.keys(headers).find(x => x.toLowerCase() === name.toLowerCase());
        return k ? headers[k] : null;
      }
    }
  };
}

exports.handler = async function (event) {
  const method = event.httpMethod;
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "";
  const allowed = allowOrigin(origin) || null;

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": allowed || "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "POST,OPTIONS",
        vary: "Origin"
      }
    };
  }

  if (!allowed && origin) return json(403, { error: "Origin not permitted." }, "*");
  if (method !== "POST") return json(405, { error: "Method not allowed" }, allowed || "*");

  if (
    !BILLING_ENABLED ||
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_BILLING_PORTAL_RETURN_URL
  ) {
    logTelemetry("billing_portal_disabled", { endpoint: "billing-create-portal-session", origin });
    return json(200, { billing_enabled: false }, allowed || "*");
  }

  try {
    const user = getJwtUser(buildReqFromEvent(event));
    if (!user) {
      logTelemetry("billing_portal_auth_invalid", {
        endpoint: "billing-create-portal-session",
        origin
      });
      return json(401, { error: "Missing or invalid token" }, allowed || "*");
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16"
    });

    const body = JSON.parse(event.body || "{}");

    const canonicalSiteUrl =
      process.env.BILLING_SITE_URL ||
      process.env.SITE_URL ||
      "https://residencysolutions.net";

    const returnUrl =
      body.return_url ||
      process.env.BILLING_BILLING_PORTAL_RETURN_URL ||
      process.env.BILLING_SUCCESS_URL ||
      process.env.BILLING_PORTAL_RETURN_URL ||
      process.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
      process.env.BILLING_CANCEL_URL ||
      process.env.BILLING_RETURN_URL ||
      canonicalSiteUrl;

    let customerId = null;
    if (body.customer_id && typeof body.customer_id === "string") {
      customerId = body.customer_id;
    }

    const params = customerId
      ? { customer: customerId, return_url: returnUrl }
      : { return_url: returnUrl };

    const session = await stripe.billingPortal.sessions.create(params);

    logTelemetry("billing_portal_session_created", {
      endpoint: "billing-create-portal-session",
      origin
    });

    return json(
      200,
      {
        billing_enabled: true,
        url: session.url
      },
      allowed || "*"
    );
  } catch (err) {
    logTelemetry("billing_portal_error", {
      endpoint: "billing-create-portal-session",
      origin,
      error: err.message
    });
    return json(500, { error: err.message || "Billing portal session failed." }, allowed || "*");
  }
};
