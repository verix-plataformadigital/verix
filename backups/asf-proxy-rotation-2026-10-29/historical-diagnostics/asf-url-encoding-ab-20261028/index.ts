const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};
Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  error: "temporary_diagnostic_retired",
  message: "This one-shot diagnostic endpoint has been retired."
}), { status: 410, headers }));
