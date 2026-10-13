using System.Text.Json;
using AiTodo.Api.Data;
using Microsoft.AspNetCore.DataProtection;

namespace AiTodo.Api.Services;

/// <summary>
/// Stores the Canvas feed URL and Claude API key in the local database, encrypted with
/// ASP.NET Data Protection (keys are protected with Windows DPAPI). Values never go back to the browser.
/// </summary>
public class SettingsService(AppDb db, IDataProtectionProvider dp)
{
    public const string CanvasFeedUrl = "CanvasFeedUrl";
    public const string AnthropicApiKey = "AnthropicApiKey";
    public const string GmailAddress = "GmailAddress";
    public const string GmailAppPassword = "GmailAppPassword";
    public const string PlannerMode = "PlannerMode";
    public const string HiddenCourses = "HiddenCourses"; // JSON array of course names left out of the Canvas list and the plan

    public const string SubmissionsLastSync = "SubmissionsLastSync"; // when the browser extension last reported submissions

    public const string ModeClaudeCode = "claude-code"; // Claude subscription via the Claude Code CLI
    public const string ModeApi = "api";                // Claude API with an API key

    private readonly IDataProtector _protector = dp.CreateProtector("AiTodo.Settings.v1");

    public async Task<string?> GetAsync(string key)
    {
        var row = await db.Settings.FindAsync(key);
        if (row is null) return null;
        try { return _protector.Unprotect(row.Value); }
        catch { return null; } // key ring was reset; treat as unset
    }

    public async Task SetAsync(string key, string? value)
    {
        var row = await db.Settings.FindAsync(key);
        if (string.IsNullOrWhiteSpace(value))
        {
            if (row is not null) db.Settings.Remove(row);
        }
        else
        {
            var enc = _protector.Protect(value.Trim());
            if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = enc });
            else row.Value = enc;
        }
        await db.SaveChangesAsync();
    }

    public async Task<string> GetPlannerModeAsync() =>
        await GetAsync(PlannerMode) == ModeApi ? ModeApi : ModeClaudeCode;

    /// <summary>Classes the user deselected. Stored as the hidden ones so a new class shows up by default.</summary>
    public async Task<string[]> GetHiddenCoursesAsync()
    {
        try { return JsonSerializer.Deserialize<string[]>(await GetAsync(HiddenCourses) ?? "[]") ?? []; }
        catch (JsonException) { return []; }
    }

    public Task SetHiddenCoursesAsync(IEnumerable<string> courses)
    {
        var hidden = courses.Distinct().ToArray();
        return SetAsync(HiddenCourses, hidden.Length == 0 ? null : JsonSerializer.Serialize(hidden));
    }

    /// <summary>The API key from settings, falling back to the ANTHROPIC_API_KEY environment variable.</summary>
    public async Task<string?> GetApiKeyAsync() =>
        await GetAsync(AnthropicApiKey) ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
}
