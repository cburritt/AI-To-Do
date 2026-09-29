using System.Text.Json;
using System.Text.Json.Serialization;
using AiTodo.Api.Data;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Beta.Messages;
using Microsoft.EntityFrameworkCore;

namespace AiTodo.Api.Services;

public record PlanFocusItem(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("ref_id")] string RefId,
    [property: JsonPropertyName("reason")] string Reason,
    [property: JsonPropertyName("estimate_minutes")] int EstimateMinutes);

public record PlanUpcomingItem(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("due_label")] string DueLabel);

public record PlanContent(
    [property: JsonPropertyName("headline")] string Headline,
    [property: JsonPropertyName("focus")] List<PlanFocusItem> Focus,
    [property: JsonPropertyName("later_this_week")] List<PlanUpcomingItem> LaterThisWeek,
    [property: JsonPropertyName("heads_up")] List<string> HeadsUp);

public class PlannerException(string message) : Exception(message);

/// <summary>
/// Builds today's plan with Claude from Canvas items, to-dos, and internship applications, either through
/// the local Claude Code CLI (the user's subscription, default) or the Claude API with an API key.
/// </summary>
public class PlannerService(AppDb db, SettingsService settings, CanvasFeedService canvas, ClaudeCodeRunner claudeCode)
{
    private const string Model = "claude-opus-5";

    private const string SystemPrompt = """
        You are the planning assistant inside AI-To-Do, a college student's personal planner.
        Each morning you turn their Canvas coursework, personal to-do list, and internship applications into a realistic plan for today.

        How to prioritize:
        - Anything overdue or due within ~36 hours comes first, weighted by how big it looks.
        - Canvas items come from a calendar feed with no submission status: an item marked done=true is finished; otherwise assume it still needs doing unless it is a plain class event (lecture, office hours) rather than work.
        - Internship deadlines are as important as coursework. An application in "Applied" for 2+ weeks with no update deserves a quick follow-up task.
        - Break big items due later this week into a concrete step for today instead of ignoring them.
        - Keep "focus" to what fits in one day, usually 3-7 items, with honest time estimates.
        - Speak directly to the student in a friendly, concise voice. No filler.

        Every focus item's ref_id must be the exact id of the source item it came from.
        """;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<(PlanContent Plan, string? Note)> GenerateAsync(CancellationToken ct = default)
    {
        var mode = await settings.GetPlannerModeAsync();
        string? apiKey = null;
        if (mode == SettingsService.ModeApi)
            apiKey = await settings.GetApiKeyAsync()
                ?? throw new PlannerException("Add your Claude API key in Settings, or switch to your Claude subscription.");

        var sync = await canvas.SyncAsync(ct);
        string? note = sync.Connected ? sync.Error : "Canvas isn't connected, so this plan only covers to-dos and internships.";

        var canvasItems = await canvas.UpcomingAsync(ct);
        var todos = await db.Todos.Where(t => !t.Done).ToListAsync(ct);
        var internships = await db.Internships.Where(i => !InternshipStatus.Closed.Contains(i.Status)).ToListAsync(ct);

        var input = new
        {
            now = DateTimeOffset.Now.ToString("dddd, MMMM d yyyy h:mm tt zzz"),
            timezone = TimeZoneInfo.Local.Id,
            canvas_items = canvasItems.Select(c => new
            {
                id = $"canvas:{c.Uid}", c.Title, c.Course,
                due = c.DueUtc?.ToLocalTime().ToString("ddd MMM d h:mm tt"), all_day = c.AllDay, done = c.Done,
            }),
            todos = todos.Select(t => new { id = $"todo:{t.Id}", t.Title, due = t.Due, t.Priority, t.Notes }),
            internships = internships.Select(i => new
            {
                id = $"internship:{i.Id}", i.Company, i.Role, i.Status, i.Deadline,
                applied_on = i.AppliedOn, i.Notes, last_updated = DateOnly.FromDateTime(i.UpdatedAt),
            }),
        };
        var prompt = "Here is my current data. Build my plan for today.\n\n" + JsonSerializer.Serialize(input, Json);

        var plan = mode == SettingsService.ModeApi
            ? await PlanWithApiAsync(apiKey!, prompt, ct)
            : (await claudeCode.RunStructuredAsync(SystemPrompt, prompt, JsonSerializer.Serialize(PlanSchema), ct))
                .Deserialize<PlanContent>();
        if (plan is null || plan.Focus is null) throw new PlannerException("Claude returned an empty plan. Try again.");

        var today = DateOnly.FromDateTime(DateTime.Now);
        var row = await db.Plans.FindAsync([today], ct);
        var planJson = JsonSerializer.Serialize(plan);
        if (row is null) db.Plans.Add(new DailyPlan { Date = today, PlanJson = planJson, Note = note });
        else { row.PlanJson = planJson; row.Note = note; row.GeneratedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync(ct);

        return (plan, note);
    }

    private static async Task<PlanContent?> PlanWithApiAsync(string apiKey, string prompt, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = apiKey };
        BetaMessage response;
        try
        {
            response = await client.Beta.Messages.Create(new MessageCreateParams
            {
                Model = Model,
                MaxTokens = 16000,
                Betas = ["server-side-fallback-2026-07-01"],
                Fallbacks = new Default(),
                System = SystemPrompt,
                OutputConfig = new BetaOutputConfig
                {
                    Effort = Effort.Medium,
                    Format = new BetaJsonOutputFormat { Schema = PlanSchema },
                },
                Messages = [new() { Role = Role.User, Content = prompt }],
            }, ct);
        }
        catch (AnthropicUnauthorizedException) { throw new PlannerException("Claude rejected the API key. Check it in Settings."); }
        catch (AnthropicRateLimitException) { throw new PlannerException("Claude API rate limit hit. Try again in a minute."); }
        catch (AnthropicApiException ex) { throw new PlannerException($"Claude API error: {ex.Message}"); }
        catch (HttpRequestException) { throw new PlannerException("Couldn't reach the Claude API. Check your internet connection."); }

        if (response.StopReason == "refusal") throw new PlannerException("Claude declined to generate a plan for this data.");
        if (response.StopReason == "max_tokens") throw new PlannerException("The plan was cut off. Try again.");

        var text = string.Concat(response.Content.Select(b => b.Value).OfType<BetaTextBlock>().Select(b => b.Text));
        return JsonSerializer.Deserialize<PlanContent>(text);
    }

    private static readonly Dictionary<string, JsonElement> PlanSchema = BuildSchema();

    private static Dictionary<string, JsonElement> BuildSchema()
    {
        string[] sources = ["canvas", "todo", "internship"];
        var schema = new
        {
            type = "object",
            properties = new
            {
                headline = new { type = "string", description = "One or two sentences summarizing the shape of today." },
                focus = new
                {
                    type = "array",
                    description = "Today's tasks in the order they should be done.",
                    items = new
                    {
                        type = "object",
                        properties = new
                        {
                            title = new { type = "string", description = "Short actionable task, e.g. 'Finish Lab 4 part 2'." },
                            source = new { type = "string", @enum = sources },
                            ref_id = new { type = "string" },
                            reason = new { type = "string", description = "Why this matters today, one short sentence." },
                            estimate_minutes = new { type = "integer" },
                        },
                        required = new[] { "title", "source", "ref_id", "reason", "estimate_minutes" },
                        additionalProperties = false,
                    },
                },
                later_this_week = new
                {
                    type = "array",
                    description = "Notable items in the next few days that are not on today's list.",
                    items = new
                    {
                        type = "object",
                        properties = new
                        {
                            title = new { type = "string" },
                            source = new { type = "string", @enum = sources },
                            due_label = new { type = "string", description = "Human-friendly due time, e.g. 'Thu 11:59pm'." },
                        },
                        required = new[] { "title", "source", "due_label" },
                        additionalProperties = false,
                    },
                },
                heads_up = new
                {
                    type = "array",
                    description = "Short warnings: things overdue, deadline pile-ups, applications going stale. Empty if none.",
                    items = new { type = "string" },
                },
            },
            required = new[] { "headline", "focus", "later_this_week", "heads_up" },
            additionalProperties = false,
        };
        return JsonSerializer.SerializeToElement(schema)
            .EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.Clone());
    }
}
