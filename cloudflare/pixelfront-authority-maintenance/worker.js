const ALLOWED_ORIGIN = "https://koreansniper.github.io";

function headers(request) {
  const origin = request.headers.get("origin");
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "vary": "Origin",
  };
}

function maintenance(request) {
  return new Response(JSON.stringify({ error: "MAINTENANCE" }), {
    status: 503,
    headers: headers(request),
  });
}

class MaintenanceRoom {
  constructor(state) {
    this.state = state;
  }

  fetch(request) {
    return maintenance(request);
  }
}

export class GameRoom extends MaintenanceRoom {}
export class GomokuRoom extends MaintenanceRoom {}
export class FpsRoom extends MaintenanceRoom {}

export default {
  fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers(request) });
    }
    return maintenance(request);
  },
};
