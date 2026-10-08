using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace VerixPortable;

internal static class Program
{
    // Public production site (obfuscated only)
    private const string AllowedHost = "verix-plataformadigital.github.io";
    private const string StartUrl = "https://verix-plataformadigital.github.io/verix/";

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

                var environment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: userDataFolder,
                    options: options
                );

                await webView.EnsureCoreWebView2Async(environment);

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
