using System.Text.Json;
using AiTodo.Api.Data;
using AiTodo.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AiTodo.Api.Endpoints;

public record TodoInput(string Title, DateOnly? Due, string? Priority, string? Notes, bool? Done);
public record InternshipInput(string Company, string Role, string? Status, DateOnly? Deadline, DateOnly? AppliedOn, string? Link, string? Notes);
public record SettingsInput(string? CanvasFeedUrl, string? AnthropicApiKey, string? PlannerMode);
public record DoneInput(bool Done);

public static class Endpoints
{
    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/ping", () => Results.NoContent()); // keep-alive from the open app window
        MapTodos(api.MapGroup("/todos"));
        MapInternships(api.MapGroup("/internships"));
        MapCanvas(api.MapGroup("/canvas"));
        MapPlan(api.MapGroup("/plan"));
        MapSettings(api.MapGroup("/settings"));
    }

    private static void MapTodos(RouteGroupBuilder g)
    {
        g.MapGet("/", async (AppDb db) =>
            await db.Todos.OrderBy(t => t.Done).ThenBy(t => t.Due == null).ThenBy(t => t.Due).ThenBy(t => t.CreatedAt).ToListAsync());

        g.MapPost("/", async (TodoInput input, AppDb db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest("Title is required.");
            var todo = new TodoItem { Title = input.Title.Trim(), Due = input.Due, Priority = NormalizePriority(input.Priority), Notes = input.Notes };
            db.Todos.Add(todo);
            await db.SaveChangesAsync();
            return Results.Created($"/api/todos/{todo.Id}", todo);
        });

        g.MapPut("/{id:int}", async (int id, TodoInput input, AppDb db) =>
        {
            var todo = await db.Todos.FindAsync(id);
            if (todo is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest("Title is required.");
            todo.Title = input.Title.Trim();
            todo.Due = input.Due;
            todo.Priority = NormalizePriority(input.Priority);
            todo.Notes = input.Notes;
            if (input.Done is bool done && done != todo.Done)
            {
                todo.Done = done;
                todo.CompletedAt = done ? DateTime.UtcNow : null;
            }
            await db.SaveChangesAsync();
            return Results.Ok(todo);
        });

        g.MapDelete("/{id:int}", async (int id, AppDb db) =>
        {
            var n = await db.Todos.Where(t => t.Id == id).ExecuteDeleteAsync();
            return n == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static string NormalizePriority(string? p) => p is "low" or "high" ? p : "normal";

    private static void MapInternships(RouteGroupBuilder g)
    {
        g.MapGet("/statuses", () => InternshipStatus.All);

        g.MapGet("/", async (AppDb db) =>
            await db.Internships.OrderBy(i => i.Deadline == null).ThenBy(i => i.Deadline).ThenByDescending(i => i.UpdatedAt).ToListAsync());

        g.MapPost("/", async (InternshipInput input, AppDb db) =>
        {
            if (Validate(input) is { } err) return Results.BadRequest(err);
            var item = new Internship { Company = input.Company.Trim(), Role = input.Role.Trim() };
            Apply(item, input);
            db.Internships.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/internships/{item.Id}", item);
        });

        g.MapPut("/{id:int}", async (int id, InternshipInput input, AppDb db) =>
        {
            var item = await db.Internships.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (Validate(input) is { } err) return Results.BadRequest(err);
            Apply(item, input);
            item.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        g.MapDelete("/{id:int}", async (int id, AppDb db) =>
        {
            var n = await db.Internships.Where(i => i.Id == id).ExecuteDeleteAsync();
            return n == 0 ? Results.NotFound() : Results.NoContent();
        });

        static string? Validate(InternshipInput i) =>
            string.IsNullOrWhiteSpace(i.Company) || string.IsNullOrWhiteSpace(i.Role) ? "Company and role are required."
            : i.Status is not null && !InternshipStatus.All.Contains(i.Status) ? $"Unknown status '{i.Status}'."
            : null;

        static void Apply(Internship item, InternshipInput i)
        {
            item.Company = i.Company.Trim();
            item.Role = i.Role.Trim();
            item.Status = i.Status ?? item.Status;
            item.Deadline = i.Deadline;
            item.AppliedOn = i.AppliedOn ?? (item.AppliedOn is null && item.Status == "Applied" ? DateOnly.FromDateTime(DateTime.Now) : item.AppliedOn);
            item.Link = string.IsNullOrWhiteSpace(i.Link) ? null : i.Link.Trim();
            item.Notes = i.Notes;
        }
    }

    private static void MapCanvas(RouteGroupBuilder g)
    {
        // Syncs the feed, then returns the window of items around today.
        // Fast: returns what's already saved. The page calls /sync separately when the data is stale.
        g.MapGet("/items", async (CanvasFeedService canvas, CancellationToken ct) => new
        {
            connected = await canvas.IsConnectedAsync(),
            error = (string?)null,
            lastSyncUtc = await canvas.LastSyncAsync(),
            items = await canvas.UpcomingAsync(ct),
        });

        // Slow: downloads the feed from Canvas, then returns the updated items.
        g.MapPost("/sync", async (CanvasFeedService canvas, CancellationToken ct) =>
        {
            var sync = await canvas.SyncAsync(ct);
            var items = await canvas.UpcomingAsync(ct);
            return new { sync.Connected, sync.Error, sync.LastSyncUtc, items };
        });

        g.MapPut("/items/{uid}/done", async (string uid, DoneInput input, AppDb db) =>
        {
            var item = await db.CanvasItems.FindAsync(uid);
            if (item is null) return Results.NotFound();
            item.Done = input.Done;
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });
    }

    private static void MapPlan(RouteGroupBuilder g)
    {
        g.MapGet("/today", async (AppDb db) =>
        {
            var row = await db.Plans.FindAsync(DateOnly.FromDateTime(DateTime.Now));
            return row is null
                ? Results.NoContent()
                : Results.Ok(new { plan = JsonSerializer.Deserialize<PlanContent>(row.PlanJson), row.Note, row.GeneratedAt });
        });

        g.MapPost("/generate", async (PlannerService planner, CancellationToken ct) =>
        {
            try
            {
                var (plan, note) = await planner.GenerateAsync(ct);
                return Results.Ok(new { plan, note, generatedAt = DateTime.UtcNow });
            }
            catch (PlannerException ex)
            {
                return Results.Problem(ex.Message, statusCode: 502);
            }
        });
    }

    private static void MapSettings(RouteGroupBuilder g)
    {
        g.MapGet("/", async (SettingsService s) => await Status(s));

        // A null field leaves that setting unchanged; an empty string clears it.
        g.MapPut("/", async (SettingsInput input, SettingsService s) =>
        {
            if (input.CanvasFeedUrl is not null)
            {
                var url = input.CanvasFeedUrl.Trim();
                if (url.Length > 0 && !(url.StartsWith("https://") || url.StartsWith("webcal://")))
                    return Results.BadRequest("The Canvas feed link should start with https:// or webcal://");
                await s.SetAsync(SettingsService.CanvasFeedUrl, url);
            }
            if (input.AnthropicApiKey is not null) await s.SetAsync(SettingsService.AnthropicApiKey, input.AnthropicApiKey);
            if (input.PlannerMode is not null)
            {
                if (input.PlannerMode is not (SettingsService.ModeApi or SettingsService.ModeClaudeCode))
                    return Results.BadRequest("Unknown planner mode.");
                await s.SetAsync(SettingsService.PlannerMode, input.PlannerMode);
            }
            return Results.Ok(await Status(s));
        });

        g.MapGet("/claude-code", async (ClaudeCodeRunner cc, CancellationToken ct) => await cc.GetAuthStatusAsync(ct));

        static async Task<object> Status(SettingsService s) => new
        {
            plannerMode = await s.GetPlannerModeAsync(),
            hasCanvasFeed = await s.GetAsync(SettingsService.CanvasFeedUrl) is not null,
            hasApiKey = await s.GetApiKeyAsync() is not null,
        };
    }
}
