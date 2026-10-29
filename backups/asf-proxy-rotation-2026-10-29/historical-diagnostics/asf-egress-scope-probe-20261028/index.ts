Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  error: "diagnostic_retired",
  message: "This one-shot cross-egress diagnostic has been retired."
}), {
  status: 410,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
}));