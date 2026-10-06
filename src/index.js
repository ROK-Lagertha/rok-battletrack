export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "rok-battletrack",
        stage: "cloudflare-migration",
        baseline: "v1.12.2b"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { ok: false, error: "API endpoint not migrated yet." },
        { status: 501 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
