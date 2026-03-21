/**
 * auth-session.js — Validates a given JWT and returns limited user info.
 * This ensures the client knows if their token is still valid on our backend.
 */

const { allowOrigin, json, logTelemetry } = require("./lib/sc-auth-lib.js");
const { getJwtUser, supabaseRestCall } = require("./lib/sc-supabase-cjs.js");

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

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

  if (!AUTH_ENABLED) {
    logTelemetry("auth_disabled_request", { endpoint: "auth-session", origin });
    return json(200, { auth_enabled: false }, allowed || "*");
  }

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": allowed || "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET,OPTIONS",
        vary: "Origin"
      }
    };
  }

  if (!allowed && origin) return json(403, { error: "Origin not permitted." }, "*");

  try {
    const user = getJwtUser(buildReqFromEvent(event));
    if (!user) {
      logTelemetry("auth_session_invalid", { endpoint: "auth-session", origin });
      return json(401, { error: "Missing or invalid token" }, allowed || "*");
    }

    // Fetch user profile from public.users to get plan limits if we wanted
    // For slice 2, just verify the JWT is alive.
    let profile = { plan: "free" };
    try {
      const data = await supabaseRestCall(`users?id=eq.${user.uid}&select=plan`, "GET", null, user.token);
      if (data && data.length > 0) profile = data[0];
    } catch (e) {
      // It's possible the trigger hasn't fired yet or RLS blocked. Safe default.
    }

    logTelemetry("auth_session_validated", {
      endpoint: "auth-session",
      origin,
      plan: profile.plan || "free"
    });

    return json(200, {
      authenticated: true,
      uid: user.uid,
      email: user.email,
      plan: profile.plan
    }, allowed || "*");

  } catch (err) {
    logTelemetry("auth_session_error", { endpoint: "auth-session", origin, error: err.message });
    return json(500, { error: err.message }, allowed || "*");
  }
};
