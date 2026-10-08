using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace VerixPortable;

internal static class Program
{
    private const string AllowedHost = "verix-plataformadigital.github.io";
    private const string StartUrl = "https://verix-plataformadigital.github.io/verix/";

    private static readonly HashSet<string> ExternalAllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "www.consumidor.asf.com.pt",
        "erru.imt-ip.pt",
        "alvaras.inem.pt",
        "location.wazept.com",
        "diariodarepublica.pt"
    };

    private static readonly HashSet<string> InternalHttpAllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "consultapsp.imtt.external.rnsi.local"
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
        private CoreWebView2Environment? webEnvironment;
        private readonly HashSet<Form> rnsiWindows = new();

        public VerixMainForm()
        {
            Text = "VÉRIX — Plataforma Digital";
            Width = 1440;
            Height = 900;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(1100, 700);
            BackColor = Color.FromArgb(3, 8, 12);

            userDataFolder = ResolveUserDataFolder();

            webView.Dock = DockStyle.Fill;
            Controls.Add(webView);

            FormClosed += (_, _) => webView.Dispose();
            Shown += async (_, _) => await InitializeWebViewAsync();
        }

        private static string ResolveUserDataFolder()
        {
            var portablePath = Path.Combine(AppContext.BaseDirectory, ".verix-data");

            try
            {
                Directory.CreateDirectory(portablePath);
                var probePath = Path.Combine(portablePath, ".write-test");
                using (var probe = File.Open(
                    probePath,
                    FileMode.OpenOrCreate,
                    FileAccess.Write,
                    FileShare.ReadWrite))
                {
                    probe.SetLength(0);
                }

                File.Delete(probePath);
                return portablePath;
            }
            catch
            {
                var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                var fallback = Path.Combine(localAppData, "VERIX", "WebView2");
                Directory.CreateDirectory(fallback);
                return fallback;
            }
        }

        private async Task InitializeWebViewAsync()
        {
            try
            {
                Directory.CreateDirectory(userDataFolder);

                var options = new CoreWebView2EnvironmentOptions(
                    additionalBrowserArguments: "--disable-features=msEdgeSidebarV2"
                );

                webEnvironment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: userDataFolder,
                    options: options
                );

                await webView.EnsureCoreWebView2Async(webEnvironment);

                var settings = webView.CoreWebView2.Settings;
                settings.AreDevToolsEnabled = false;
                settings.AreDefaultContextMenusEnabled = false;
                settings.AreDefaultScriptDialogsEnabled = false;
                settings.IsStatusBarEnabled = false;
                settings.IsZoomControlEnabled = true;
                settings.AreHostObjectsAllowed = false;
                settings.AreBrowserAcceleratorKeysEnabled = false;
                settings.IsGeneralAutofillEnabled = false;
                settings.IsPasswordAutosaveEnabled = false;
                settings.IsWebMessageEnabled = false;
                settings.IsSwipeNavigationEnabled = false;

                webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
                webView.CoreWebView2.FrameNavigationStarting += OnFrameNavigationStarting;
                webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                webView.CoreWebView2.DownloadStarting += OnDownloadStarting;

                webView.CoreWebView2.ProcessFailed += (_, e) =>
                {
                    if (IsDisposed) return;
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

        private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            try
            {
                var uri = new Uri(e.Uri);

                if (IsAllowedProductionUri(uri))
                {
                    return;
                }

                if (uri.Scheme == Uri.UriSchemeHttps && ExternalAllowedHosts.Contains(uri.Host))
                {
                    e.Cancel = true;
                    LaunchExternal(uri);
                    return;
                }

                if (IsAllowedInternalRnsUri(uri))
                {
                    e.Cancel = true;
                    LaunchExternal(uri);
                    return;
                }

                e.Cancel = true;
            }
            catch
            {
                e.Cancel = true;
            }
        }

        private void OnFrameNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            try
            {
                var uri = new Uri(e.Uri);

                // VÉRIX does not require remote frames. Keep child-frame navigation
                // restricted to the same trusted production origin so an iframe
                // cannot turn an otherwise safe top-level page into a new network
                // surface.
                if (IsAllowedProductionUri(uri))
                {
                    return;
                }

                e.Cancel = true;
            }
            catch
            {
                e.Cancel = true;
            }
        }

        private async void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            if (!e.IsUserInitiated)
            {
                e.Handled = true;
                return;
            }

            try
            {
                var uri = new Uri(e.Uri);

                if (IsAllowedProductionUri(uri))
                {
                    e.Handled = true;
                    webView.CoreWebView2.Navigate(uri.ToString());
                    return;
                }

                if (IsAllowedInternalRnsUri(uri))
                {
                    var deferral = e.GetDeferral();
                    try
                    {
                        var child = await CreateRnsiWindowAsync(uri);
                        e.NewWindow = child.CoreWebView2;
                        child.Form.Show(this);
                        e.Handled = false;
                    }
                    finally
                    {
                        deferral.Complete();
                    }
                    return;
                }

                if (uri.Scheme == Uri.UriSchemeHttps &&
                    ExternalAllowedHosts.Contains(uri.Host))
                {
                    e.Handled = true;
                    LaunchExternal(uri);
                    return;
                }

                e.Handled = true;
            }
            catch
            {
                e.Handled = true;
            }
        }

        private async Task<(Form Form, CoreWebView2 CoreWebView2)> CreateRnsiWindowAsync(Uri requestedUri)
        {
            if (webEnvironment is null)
            {
                throw new InvalidOperationException("O ambiente WebView2 ainda não foi inicializado.");
            }

            var form = new Form
            {
                Text = GetRnsiWindowTitle(requestedUri),
                Width = 1200,
                Height = 800,
                StartPosition = FormStartPosition.CenterParent,
                MinimumSize = new Size(900, 600),
                BackColor = Color.FromArgb(3, 8, 12)
            };

            var view = new WebView2 { Dock = DockStyle.Fill };
            form.Controls.Add(view);
            rnsiWindows.Add(form);

            form.FormClosed += (_, _) =>
            {
                rnsiWindows.Remove(form);
                view.Dispose();
            };

            await view.EnsureCoreWebView2Async(webEnvironment);

            var settings = view.CoreWebView2.Settings;
            settings.AreDevToolsEnabled = false;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDefaultScriptDialogsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = true;
            settings.AreHostObjectsAllowed = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            settings.IsWebMessageEnabled = false;
            settings.IsSwipeNavigationEnabled = false;

            view.CoreWebView2.NavigationStarting += OnRnsiNavigationStarting;
            view.CoreWebView2.FrameNavigationStarting += OnRnsiFrameNavigationStarting;
            view.CoreWebView2.NewWindowRequested += OnRnsiNewWindowRequested;
            view.CoreWebView2.DownloadStarting += OnRnsDownloadStarting;

            return (form, view.CoreWebView2);
        }

        private static string GetRnsiWindowTitle(Uri uri)
        {
            return uri.AbsolutePath.Contains("consulta_livrete.php", StringComparison.OrdinalIgnoreCase)
                ? "VÉRIX — RNSI / Livrete"
                : "VÉRIX — RNSI / Inspeção";
        }

        private static void OnRnsiNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            try
            {
                e.Cancel = !IsAllowedInternalRnsUri(new Uri(e.Uri));
            }
            catch
            {
                e.Cancel = true;
            }
        }

        private static void OnRnsiFrameNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            try
            {
                e.Cancel = !IsAllowedInternalRnsUri(new Uri(e.Uri));
            }
            catch
            {
                e.Cancel = true;
            }
        }

        private static void OnRnsiNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
        }

        private static void OnRnsDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
        {
            e.Cancel = true;
        }

        private static bool IsAllowedProductionUri(Uri uri)
        {
            return uri.Scheme == Uri.UriSchemeHttps &&
                string.Equals(uri.Host, AllowedHost, StringComparison.OrdinalIgnoreCase) &&
                (uri.Port == -1 || uri.Port == 443) &&
                uri.AbsolutePath.StartsWith("/verix/", StringComparison.OrdinalIgnoreCase) &&
                string.IsNullOrEmpty(uri.UserInfo);
        }

        private static void LaunchExternal(Uri uri)
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
                // Keep external navigation blocked if launch fails.
            }
        }

        private static bool IsAllowedInternalRnsUri(Uri uri)
        {
            return uri.Scheme == Uri.UriSchemeHttp &&
                InternalHttpAllowedHosts.Contains(uri.Host) &&
                uri.AbsolutePath.StartsWith("/veiculos/", StringComparison.OrdinalIgnoreCase) &&
                string.IsNullOrEmpty(uri.UserInfo);
        }

        private static void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
        {
            e.Cancel = true;
        }
    }
}
