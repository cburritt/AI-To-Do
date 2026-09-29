using System.Diagnostics;
using System.Text.Json;

namespace AiTodo.Api.Services;

/// <summary>
/// Runs a one-shot prompt through the locally installed Claude Code CLI (`claude -p`), which uses
/// the signed-in Claude subscription instead of an API key. Tools are disabled; it only answers.
/// </summary>
public class ClaudeCodeRunner(AppPaths paths, ILogger<ClaudeCodeRunner> log)
{
    private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(5);

    public record AuthStatus(bool Installed, bool LoggedIn, string? Detail);

    public async Task<AuthStatus> GetAuthStatusAsync(CancellationToken ct = default)
    {
        var exe = FindClaude();
        if (exe is null) return new(false, false, "Claude Code isn't installed.");
        try
        {
            var (exit, stdout, _) = await RunAsync(exe, ["auth", "status"], null, TimeSpan.FromSeconds(30), ct);
            using var doc = JsonDocument.Parse(stdout);
            var loggedIn = doc.RootElement.TryGetProperty("loggedIn", out var li) && li.GetBoolean();
            return new(true, loggedIn, loggedIn ? null : "Claude Code isn't signed in.");
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or TimeoutException)
        {
            log.LogWarning(ex, "claude auth status failed");
            return new(true, false, "Couldn't check the Claude Code sign-in.");
        }
    }

    /// <summary>Sends <paramref name="prompt"/> and returns output matching <paramref name="schemaJson"/>.</summary>
    public async Task<JsonElement> RunStructuredAsync(string systemPrompt, string prompt, string schemaJson, CancellationToken ct)
    {
        var exe = FindClaude() ?? throw new PlannerException(
            "Claude Code isn't installed. Install it from claude.com/code, or switch to an API key in Settings.");

        string[] args =
        [
            "-p",
            "--output-format", "json",
            "--model", "opus",
            "--tools", "",
            "--no-session-persistence",
            "--disable-slash-commands",
            "--strict-mcp-config",
            "--system-prompt", systemPrompt,
            "--json-schema", schemaJson,
        ];

        var (exit, stdout, stderr) = await RunAsync(exe, args, prompt, Timeout, ct);

        JsonElement result;
        try
        {
            using var doc = JsonDocument.Parse(stdout);
            result = doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            log.LogWarning("claude exited {Exit} with non-JSON output. stderr: {Stderr}", exit, stderr);
            throw new PlannerException("Claude Code didn't return a result. Make sure it runs in a terminal (type `claude`).");
        }

        if (result.TryGetProperty("is_error", out var isErr) && isErr.GetBoolean())
        {
            var msg = result.TryGetProperty("result", out var r) ? r.GetString() ?? "" : "";
            log.LogWarning("claude returned an error: {Message}", msg);
            if (msg.Contains("authenticate", StringComparison.OrdinalIgnoreCase) || msg.Contains("log in", StringComparison.OrdinalIgnoreCase)
                || msg.Contains("login", StringComparison.OrdinalIgnoreCase) || msg.Contains("OAuth", StringComparison.OrdinalIgnoreCase))
                throw new PlannerException("Claude Code isn't signed in. Open a terminal, run `claude`, and type /login.");
            if (msg.Contains("limit", StringComparison.OrdinalIgnoreCase))
                throw new PlannerException($"Claude usage limit reached: {msg}");
            throw new PlannerException($"Claude Code error: {msg}");
        }

        // With --json-schema the validated object is in structured_output; fall back to parsing the text result.
        if (result.TryGetProperty("structured_output", out var so) && so.ValueKind == JsonValueKind.Object)
            return so.Clone();
        if (result.TryGetProperty("result", out var text) && text.GetString() is { } s)
        {
            try { return JsonDocument.Parse(s).RootElement.Clone(); }
            catch (JsonException) { }
        }
        throw new PlannerException("Claude Code returned a plan in an unexpected format. Try again.");
    }

    private async Task<(int Exit, string Stdout, string Stderr)> RunAsync(
        string exe, IEnumerable<string> args, string? stdin, TimeSpan timeout, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(exe)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            // An empty folder, so Claude Code doesn't pick up CLAUDE.md files or project settings.
            WorkingDirectory = paths.ClaudeWorkDir,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8,
            StandardInputEncoding = new System.Text.UTF8Encoding(false),
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        // An API key in the environment would take priority over the subscription login.
        psi.Environment.Remove("ANTHROPIC_API_KEY");
        psi.Environment.Remove("ANTHROPIC_AUTH_TOKEN");

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Couldn't start Claude Code.");
        var stdoutTask = proc.StandardOutput.ReadToEndAsync(ct);
        var stderrTask = proc.StandardError.ReadToEndAsync(ct);
        if (stdin is not null) await proc.StandardInput.WriteAsync(stdin);
        proc.StandardInput.Close();

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        try
        {
            await proc.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            proc.Kill(entireProcessTree: true);
            if (ct.IsCancellationRequested) throw;
            throw new PlannerException("Claude Code took too long to respond. Try again.");
        }
        return (proc.ExitCode, await stdoutTask, await stderrTask);
    }

    private static string? FindClaude()
    {
        var names = OperatingSystem.IsWindows() ? new[] { "claude.exe", "claude.cmd" } : ["claude"];
        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)
            .Append(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin"));
        foreach (var dir in dirs)
        foreach (var name in names)
        {
            var p = Path.Combine(dir.Trim('"'), name);
            if (File.Exists(p)) return p;
        }
        return null;
    }
}

public class AppPaths
{
    public string DataDir { get; }
    public string ClaudeWorkDir { get; }

    public AppPaths()
    {
        DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AiTodo");
        ClaudeWorkDir = Path.Combine(DataDir, "claude-work");
        Directory.CreateDirectory(ClaudeWorkDir);
    }
}
