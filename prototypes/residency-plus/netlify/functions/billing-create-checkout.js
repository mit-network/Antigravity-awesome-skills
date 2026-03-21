/**
 * billing-create-checkout.js — Stripe Checkout session via REST API (no stripe npm package).
 *
 * Uses fetch() to call Stripe API so the function has no external runtime deps.
 * Returns plain { statusCode, headers, body } in every path. Top-level try/catch prevents 502 HTML.
 */

const { allowOrigin, logTelemetry } = require("./lib/sc-auth-lib.js");
const { getJwtUser } = require("./lib/sc-supabase-cjs.js");

const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
const STRIPE_PRICE_RESIDENCY_PLUS = process.env.STRIPE_PRICE_RESIDENCY_PLUS;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function responseJson(status, body, origin) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin || "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body)
  };
}

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
  const headers = event.headers || {};
  const rawOrigin = headers.origin || headers.Origin || "";
  const origin = (function () {
    try { return allowOrigin(rawOrigin); } catch { return "*"; }
  })();

  try {
    return await handle(event, origin, rawOrigin);
  } catch (err) {
    console.error("[billing-create-checkout] uncaught", err?.message || err);
    return responseJson(500, { error: err?.message || "Checkout failed.", billing_enabled: true }, origin);
  }
};

async function handle(event, origin, rawOrigin) {
  const method = event.httpMethod;

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": origin || "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "POST,OPTIONS",
        vary: "Origin"
      }
    };
  }

  if (!origin && rawOrigin) return responseJson(403, { error: "Origin not permitted." }, null);
  if (method !== "POST") return responseJson(405, { error: "Method not allowed" }, origin);

  console.log("[billing-create-checkout] billing_enabled=" + BILLING_ENABLED + " has_stripe_secret=" + !!STRIPE_SECRET_KEY + " has_price_id=" + !!STRIPE_PRICE_RESIDENCY_PLUS);

  if (!BILLING_ENABLED || !STRIPE_SECRET_KEY || !STRIPE_PRICE_RESIDENCY_PLUS) {
    logTelemetry("billing_checkout_disabled", { endpoint: "billing-create-checkout", origin });
    return responseJson(200, { billing_enabled: false, error: "Billing is not configured for this environment." }, origin);
  }

  let user;
  try {
    user = getJwtUser(buildReqFromEvent(event));
  } catch (e) {
    console.error("[billing-create-checkout] getJwtUser error", e?.message || e);
    return responseJson(401, { error: "Missing or invalid token", billing_enabled: true }, origin);
  }
  if (!user) {
    logTelemetry("billing_checkout_auth_invalid", { endpoint: "billing-create-checkout", origin });
    console.log("[billing-create-checkout] no authenticated user");
    return responseJson(401, { error: "Missing or invalid token", billing_enabled: true }, origin);
  }
  console.log("[billing-create-checkout] user id=" + (user.uid || "") + " email=" + (user.email ? "(present)" : "(none)"));

  try {
    const body = JSON.parse(event.body || "{}");
    const successUrl = body.success_url || process.env.BILLING_SUCCESS_URL;
    const cancelUrl = body.cancel_url || process.env.BILLING_CANCEL_URL;

    // Stripe API v1: form-encoded POST
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", STRIPE_PRICE_RESIDENCY_PLUS);
    params.set("line_items[0][quantity]", "1");
    if (successUrl) params.set("success_url", successUrl);
    if (cancelUrl) params.set("cancel_url", cancelUrl);
    if (user.email) params.set("customer_email", user.email);
    params.set("metadata[rplus_user_id]", user.uid || "");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const raw = await stripeRes.text();
    let session;
    try {
      session = raw ? JSON.parse(raw) : null;
    } catch (parseErr) {
      console.error("[billing-create-checkout] Stripe response not JSON", raw?.slice(0, 200));
      return responseJson(500, { error: "Stripe returned an invalid response.", billing_enabled: true }, origin);
    }

    if (!stripeRes.ok) {
      const errMsg = session?.error?.message || session?.error || raw || "Stripe request failed";
      console.error("[billing-create-checkout] Stripe API error", stripeRes.status, errMsg);
      logTelemetry("billing_checkout_error", { endpoint: "billing-create-checkout", origin, error: errMsg });
      return responseJson(500, { error: errMsg, billing_enabled: true }, origin);
    }

    const url = session?.url;
    console.log("[billing-create-checkout] Stripe session created url=" + !!url);
    logTelemetry("billing_checkout_started", { endpoint: "billing-create-checkout", origin, plan: "residency_plus" });

    return responseJson(200, { billing_enabled: true, url }, origin);
  } catch (err) {
    console.error("[billing-create-checkout] Stripe error", err?.message || err);
    logTelemetry("billing_checkout_error", { endpoint: "billing-create-checkout", origin, error: err?.message });
    return responseJson(500, { error: err?.message || "Billing checkout failed.", billing_enabled: true }, origin);
  }
}
