using System.Text.RegularExpressions;
using AiTodo.Api.Data;
using Ical.Net;
using Microsoft.EntityFrameworkCore;

namespace AiTodo.Api.Services;

/// <summary>
/// Syncs coursework from the Canvas calendar feed (.ics). K-State blocks personal API tokens,
/// so the feed is the data source; it has due dates but no submission status.
/// </summary>
public partial class CanvasFeedService(AppDb db, SettingsService settings, HttpClient http, ILogger<CanvasFeedService> log)
{
    public const int LookbackDays = 7;
    public const int LookaheadDays = 14;

    public record SyncResult(bool Connected, string? Error, DateTime? LastSyncUtc);

    // Canvas titles look like "Lab 4 [CIS 501 - Fall 2026]".
    [GeneratedRegex(@"^(?<title>.*?)\s*\[(?<course>[^\]]+)\]\s*$")]
    private static partial Regex TitleWithCourse();

    public async Task<SyncResult> SyncAsync(CancellationToken ct = default)
    {
        var url = await settings.GetAsync(SettingsService.CanvasFeedUrl);
        if (url is null) return new(false, "Add your Canvas calendar feed link in Settings.", null);

        if (url.StartsWith("webcal://", StringComparison.OrdinalIgnoreCase))
            url = "https://" + url["webcal://".Length..];

        string ics;
        try
        {
            ics = await http.GetStringAsync(url, ct);
        }
        catch (HttpRequestException ex)
        {
            log.LogWarning(ex, "Canvas feed fetch failed");
            var reason = ex.StatusCode switch
            {
                System.Net.HttpStatusCode.NotFound =>
                    "Canvas says the feed link doesn't exist (404). Copy the Calendar Feed link again and paste the whole thing.",
                System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden =>
                    $"Canvas refused the feed link ({(int)ex.StatusCode}). Copy the Calendar Feed link again.",
                { } code => $"Canvas returned an error ({(int)code}) for the feed link.",
                null => $"Couldn't reach Canvas: {ex.Message}",
            };
            return new(true, reason, await LastSyncAsync());
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Canvas feed fetch timed out");
            return new(true, "Canvas took too long to send the feed. Try again in a minute.", await LastSyncAsync());
        }

        Calendar? cal;
        try { cal = Calendar.Load(ics); }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Canvas feed parse failed");
            return new(true, "The Canvas feed link didn't return a calendar. Check the link in Settings.", await LastSyncAsync());
        }
        if (cal is null) return new(true, "The Canvas feed was empty.", await LastSyncAsync());

        var now = DateTime.UtcNow;
        var existing = await db.CanvasItems.ToDictionaryAsync(c => c.Uid, ct);

        foreach (var ev in cal.Events)
        {
            if (string.IsNullOrEmpty(ev.Uid) || ev.DtStart is null) continue;

            var summary = ev.Summary ?? "Untitled";
            var m = TitleWithCourse().Match(summary);
            var title = m.Success ? m.Groups["title"].Value : summary;
            var course = m.Success ? m.Groups["course"].Value : "";

            var allDay = !ev.DtStart.HasTime;
            // All-day items are treated as due at the end of that local day.
            DateTime dueUtc = allDay
                ? ev.DtStart.Date.ToDateTime(new TimeOnly(23, 59), DateTimeKind.Local).ToUniversalTime()
                : ev.DtStart.AsUtc;

            if (!existing.TryGetValue(ev.Uid, out var item))
            {
                item = new CanvasItem { Uid = ev.Uid, Title = title };
                db.CanvasItems.Add(item);
                existing[ev.Uid] = item;
            }
            item.Title = title;
            item.Course = course;
            item.DueUtc = dueUtc;
            item.AllDay = allDay;
            item.Url = ev.Url?.ToString();
            item.LastSeenUtc = now;
        }

        // Drop items Canvas removed, and anything long past.
        var cutoff = now.AddDays(-30);
        foreach (var stale in existing.Values.Where(i => i.LastSeenUtc < now || i.DueUtc < cutoff))
            db.CanvasItems.Remove(stale);

        await db.SaveChangesAsync(ct);
        await settings.SetAsync("CanvasLastSync", now.ToString("O"));
        return new(true, null, now);
    }

    public async Task<List<CanvasItem>> UpcomingAsync(CancellationToken ct = default)
    {
        var from = DateTime.UtcNow.AddDays(-LookbackDays);
        var to = DateTime.UtcNow.AddDays(LookaheadDays);
        return await db.CanvasItems
            .Where(i => i.DueUtc >= from && i.DueUtc <= to)
            .OrderBy(i => i.DueUtc)
            .ToListAsync(ct);
    }

    private async Task<DateTime?> LastSyncAsync() =>
        DateTime.TryParse(await settings.GetAsync("CanvasLastSync"), null,
            System.Globalization.DateTimeStyles.RoundtripKind, out var d) ? d : null;
}
