using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace VerixPortable;

internal static class Program
{
    // Public production site (obfuscated only)
    private const string AllowedHost = "verix-plataformadigital.github.io";
    private const string StartUrl = "https://verix-plataformadigital.github.io/verix/";

    // Experimental only: intercept the browser's normal relay URL inside this
    // portable host and make the same direct POST to the ASF endpoint locally.
    // Normal Chrome/Edge tabs and the hosted application remain unchanged.
    private const string AsfProxyUrl = "https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-proxy-v1";
    private const string AsfProxyHost = "onilkakbgpklxvxuxmks.supabase.co";
    private const string AsfProxyPath = "/functions/v1/asf-proxy-v1";
    private const string AsfEndpoint = "https://ext01.asf.com.pt/api/src/";
    private static readonly TimeSpan AsfTimeout = TimeSpan.FromSeconds(15);
    private static readonly HashSet<string> NativeAllowedOrigins = new(StringComparer.OrdinalIgnoreCase)
    {
        "https://verix-plataformadigital.github.io",
        "https://verix.vxops.workers.dev"
    };
    private static readonly HttpClient AsfHttpClient = new(new HttpClientHandler
    {
        AllowAutoRedirect = true
    });


    // External sites deliberately opened by VÉRIX. They are launched in the
    // user's default browser, while every other external navigation is blocked.
    private static readonly HashSet<string> ExternalAllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "www.consumidor.asf.com.pt",
        "erru.imt-ip.pt",
        "alvaras.inem.pt",
        "location.wazept.com"
    };

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new VerixMainForm());
    }

    private sealed class VerixMainForm : Form
    {
        private readonly WebView2 webView = new();
        private readonly string userDataFolder;
        private CoreWebView2Environment? webViewEnvironment;

        public VerixMainForm()
        {
            Text = "VÉRIX — Plataforma Digital";
            Width = 1440;
            Height = 900;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(1100, 700);
            BackColor = Color.FromArgb(3, 8, 12);

            userDataFolder = Path.Combine(AppContext.BaseDirectory, ".verix-data");

            webView.Dock = DockStyle.Fill;
            Controls.Add(webView);

            FormClosed += (_, _) => webView.Dispose();
            Shown += async (_, _) => await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            try
            {
                Directory.CreateDirectory(userDataFolder);

                var options = new CoreWebView2EnvironmentOptions(
                    additionalBrowserArguments: "--disable-features=msEdgeSidebarV2"
                );

                webViewEnvironment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: userDataFolder,
                    options: options
                );

                await webView.EnsureCoreWebView2Async(webViewEnvironment);

                var settings = webView.CoreWebView2.Settings;
                settings.AreDevToolsEnabled = false;
                settings.AreDefaultContextMenusEnabled = false;
                settings.AreDefaultScriptDialogsEnabled = false;
                settings.IsStatusBarEnabled = false;
                settings.IsZoomControlEnabled = true;
                settings.AreHostObjectsAllowed = false;

                webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
                webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                webView.CoreWebView2.DownloadStarting += OnDownloadStarting;

                // The page keeps its existing client code and URL. Only this
                // Windows host intercepts the exact ASF relay endpoint.
                webView.CoreWebView2.AddWebResourceRequestedFilter(
                    AsfProxyUrl + "*",
                    CoreWebView2WebResourceContext.All
                );
                webView.CoreWebView2.WebResourceRequested += OnWebResourceRequested;

                webView.CoreWebView2.ProcessFailed += (_, e) =>
                {
                    BeginInvoke(() =>
                        MessageBox.Show(
                            this,
                            $"O motor VÉRIX foi encerrado inesperadamente ({e.ProcessFailedKind}).",
                            "VÉRIX — Falha de segurança",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        )
                    );
                };

                webView.CoreWebView2.Navigate(StartUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    this,
                    "Não foi possível iniciar o motor WebView2.\n\n" +
                    "Confirma que o Microsoft Edge WebView2 Runtime está disponível neste PC.\n\n" +
                    ex.Message,
                    "VÉRIX — Inicialização",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                Close();
            }
        }

        private async void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            var request = e.Request;
            if (!Uri.TryCreate(request.Uri, UriKind.Absolute, out var target) ||
                !string.Equals(target.Host, AsfProxyHost, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(target.AbsolutePath, AsfProxyPath, StringComparison.Ordinal))
            {
                return;
            }

            var deferral = e.GetDeferral();
            var origin = TryGetHeader(request.Headers, "Origin");

            try
            {
                if (!IsAllowedOrigin(origin))
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"origin_not_allowed\"}",
                        403,
                        "Forbidden",
                        origin,
                        includeCors: false
                    );
                    return;
                }

                if (string.Equals(request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    var requestedMethod = TryGetHeader(request.Headers, "Access-Control-Request-Method");
                    if (!string.IsNullOrEmpty(requestedMethod) &&
                        !string.Equals(requestedMethod, "POST", StringComparison.OrdinalIgnoreCase))
                    {
                        e.Response = CreateAsfResponse(
                            "{\"ok\":false,\"error\":\"method_not_allowed\"}",
                            405,
                            "Method Not Allowed",
                            origin
                        );
                        return;
                    }

                    e.Response = CreateAsfResponse("", 204, "No Content", origin);
                    return;
                }

                if (!string.Equals(request.Method, "POST", StringComparison.OrdinalIgnoreCase))
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"method_not_allowed\"}",
                        405,
                        "Method Not Allowed",
                        origin
                    );
                    return;
                }

                var requestBody = await ReadRequestBodyAsync(request.Content);
                if (Encoding.UTF8.GetByteCount(requestBody) > 16 * 1024)
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"body_too_large\"}",
                        413,
                        "Content Too Large",
                        origin
                    );
                    return;
                }

                AsfRelayPayload? payload;
                try
                {
                    payload = JsonSerializer.Deserialize<AsfRelayPayload>(
                        requestBody,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                    );
                }
                catch (JsonException)
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"invalid_json\"}",
                        400,
                        "Bad Request",
                        origin
                    );
                    return;
                }

                var plate = (payload?.Matricula ?? "").Trim().ToUpperInvariant();
                var date = (payload?.Date ?? "").Trim();

                if (!Regex.IsMatch(plate, "^[A-Z0-9]{6,8}$", RegexOptions.CultureInvariant))
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"invalid_plate\"}",
                        400,
                        "Bad Request",
                        origin
                    );
                    return;
                }

                if (!DateTime.TryParseExact(
                    date,
                    "yyyy/MM/dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out _))
                {
                    e.Response = CreateAsfResponse(
                        "{\"ok\":false,\"error\":\"invalid_date\"}",
                        400,
                        "Bad Request",
                        origin
                    );
                    return;
                }

                // Same endpoint, POST method, null body and GraphQL URL
                // parameter used by the official Android app and the relay.
                var query =
                    "mutation license { mobishoutEntry { noone { entry { licenseNumber(license: \"" +
                    plate + "\", date: \"" + date +
                    "\") { nodes { id entity startDate endDate policy license code logo } } } } } }";
                var upstreamUrl = AsfEndpoint + "?query=" + Uri.EscapeDataString(query);

                using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, upstreamUrl);
                upstreamRequest.Headers.TryAddWithoutValidation("Accept", "application/json, text/plain, */*");
                upstreamRequest.Headers.TryAddWithoutValidation("Cache-Control", "no-cache");
                upstreamRequest.Headers.TryAddWithoutValidation("Pragma", "no-cache");

                var stopwatch = Stopwatch.StartNew();
                using var timeout = new CancellationTokenSource(AsfTimeout);
                using var upstreamResponse = await AsfHttpClient.SendAsync(
                    upstreamRequest,
                    HttpCompletionOption.ResponseContentRead,
                    timeout.Token
                );
                var responseBody = await upstreamResponse.Content.ReadAsStringAsync(timeout.Token);
                stopwatch.Stop();

                var contentType = upstreamResponse.Content.Headers.ContentType?.ToString()
                    ?? "application/json; charset=utf-8";
                string? retryAfter = null;
                if (upstreamResponse.Headers.TryGetValues("Retry-After", out var retryValues))
                {
                    retryAfter = retryValues.FirstOrDefault();
                }

                e.Response = CreateAsfResponse(
                    responseBody,
                    (int)upstreamResponse.StatusCode,
                    upstreamResponse.ReasonPhrase ?? "OK",
                    origin,
                    stopwatch.ElapsedMilliseconds,
                    contentType,
                    retryAfter
                );
            }
            catch (OperationCanceledException)
            {
                e.Response = CreateAsfResponse(
                    "{\"ok\":false,\"error\":\"direct_upstream_timeout\"}",
                    504,
                    "Gateway Timeout",
                    origin
                );
            }
            catch (Exception ex)
            {
                // Do not log the URL or query: the ASF query URL contains the plate.
                Debug.WriteLine("[ASF direct-native] " + ex.GetType().Name);
                e.Response = CreateAsfResponse(
                    "{\"ok\":false,\"error\":\"direct_upstream_error\"}",
                    502,
                    "Bad Gateway",
                    origin
                );
            }
            finally
            {
                deferral.Complete();
            }
        }

        private CoreWebView2WebResourceResponse CreateAsfResponse(
            string body,
            int statusCode,
            string reasonPhrase,
            string? origin,
            long? latencyMs = null,
            string? contentType = null,
            string? retryAfter = null,
            bool includeCors = true)
        {
            var headers = new List<string>
            {
                "Content-Type: " + SafeHeaderValue(contentType ?? "application/json; charset=utf-8"),
                "Cache-Control: no-store, max-age=0",
                "X-Content-Type-Options: nosniff",
                "X-Verix-ASF-Relay: direct-native"
            };

            if (includeCors && IsAllowedOrigin(origin))
            {
                headers.Add("Access-Control-Allow-Origin: " +
                    (string.IsNullOrWhiteSpace(origin) || string.Equals(origin, "null", StringComparison.Ordinal)
                        ? "*"
                        : origin));
                headers.Add("Access-Control-Allow-Methods: POST,OPTIONS");
                headers.Add("Access-Control-Allow-Headers: content-type,x-verix-build-id,x-verix-client-token");
                headers.Add("Access-Control-Expose-Headers: X-Verix-ASF-Relay, X-Verix-ASF-Latency-Ms, Retry-After");
                headers.Add("Access-Control-Max-Age: 600");
                headers.Add("Vary: Origin");
            }

            if (latencyMs.HasValue)
            {
                headers.Add("X-Verix-ASF-Latency-Ms: " + Math.Max(0, latencyMs.Value).ToString(CultureInfo.InvariantCulture));
            }

            if (!string.IsNullOrWhiteSpace(retryAfter))
            {
                var safeRetryAfter = SafeHeaderValue(retryAfter);
                if (!string.IsNullOrWhiteSpace(safeRetryAfter))
                {
                    headers.Add("Retry-After: " + safeRetryAfter);
                }
            }

            var environment = webViewEnvironment
                ?? throw new InvalidOperationException("WebView2 environment is not initialized.");
            var stream = new MemoryStream(Encoding.UTF8.GetBytes(body ?? ""));
            return environment.CreateWebResourceResponse(
                stream,
                statusCode,
                SafeHeaderValue(reasonPhrase),
                string.Join("\r\n", headers)
            );
        }

        private static bool IsAllowedOrigin(string? origin)
        {
            if (string.IsNullOrWhiteSpace(origin) || string.Equals(origin, "null", StringComparison.Ordinal))
            {
                return true;
            }

            return NativeAllowedOrigins.Contains(origin.Trim());
        }

        private static string? TryGetHeader(CoreWebView2HttpRequestHeaders headers, string name)
        {
            try
            {
                return headers.GetHeader(name);
            }
            catch
            {
                return null;
            }
        }

        private static string SafeHeaderValue(string value) =>
            (value ?? "").Replace("\r", "").Replace("\n", "").Trim();

        private static async Task<string> ReadRequestBodyAsync(Stream? body)
        {
            if (body is null) return "";

            using var reader = new StreamReader(
                body,
                Encoding.UTF8,
                detectEncodingFromByteOrderMarks: false,
                bufferSize: 1024,
                leaveOpen: true
            );
            return await reader.ReadToEndAsync();
        }

        private sealed class AsfRelayPayload
        {
            [JsonPropertyName("matricula")]
            public string? Matricula { get; set; }

            [JsonPropertyName("date")]
            public string? Date { get; set; }
        }

        private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            try
            {
                var uri = new Uri(e.Uri);
                if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    return;
                }

                if (string.Equals(uri.Host, AllowedHost, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                if (ExternalAllowedHosts.Contains(uri.Host))
                {
                    e.Cancel = true;
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = uri.ToString(),
                            UseShellExecute = true
                        });
                    }
                    catch
                    {
                        // Keep navigation blocked if the default browser cannot be launched.
                    }
                    return;
                }

                e.Cancel = true;
            }
            catch
            {
                e.Cancel = true;
            }
        }

        private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try
            {
                var uri = new Uri(e.Uri);
                if (string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(uri.Host, AllowedHost, StringComparison.OrdinalIgnoreCase))
                {
                    webView.CoreWebView2.Navigate(uri.ToString());
                    return;
                }

                if (string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                    ExternalAllowedHosts.Contains(uri.Host))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = uri.ToString(),
                            UseShellExecute = true
                        });
                    }
                    catch
                    {
                        // Ignore external-launch failures.
                    }
                }
            }
            catch
            {
                // Block malformed or external windows.
            }
        }

        private static void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
        {
            e.Cancel = true;
        }
    }
}
