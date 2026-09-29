using System.ComponentModel.DataAnnotations;

namespace AiTodo.Api.Data;

public class TodoItem
{
    public int Id { get; set; }
    [MaxLength(300)] public required string Title { get; set; }
    public DateOnly? Due { get; set; }
    public string Priority { get; set; } = "normal"; // low | normal | high
    public string? Notes { get; set; }
    public bool Done { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}

public static class InternshipStatus
{
    public static readonly string[] All = ["Wishlist", "Applied", "OA", "Interviewing", "Offer", "Rejected", "Withdrawn"];
    public static readonly string[] Closed = ["Rejected", "Withdrawn"];
}

public class Internship
{
    public int Id { get; set; }
    [MaxLength(200)] public required string Company { get; set; }
    [MaxLength(200)] public required string Role { get; set; }
    public string Status { get; set; } = "Wishlist";
    public DateOnly? Deadline { get; set; }
    public DateOnly? AppliedOn { get; set; }
    public string? Link { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>An event from the Canvas calendar feed. Keyed by the feed's UID so re-syncs update in place.</summary>
public class CanvasItem
{
    [Key] public required string Uid { get; set; }
    public required string Title { get; set; }
    public string Course { get; set; } = "";
    public DateTime? DueUtc { get; set; }
    public bool AllDay { get; set; }
    public string? Url { get; set; }
    public bool Done { get; set; } // the feed has no submission status, so the user marks items done
    public DateTime LastSeenUtc { get; set; }
}

public class DailyPlan
{
    [Key] public DateOnly Date { get; set; }
    public required string PlanJson { get; set; }
    public string? Note { get; set; }
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
}

public class AppSetting
{
    [Key] public required string Key { get; set; }
    public required string Value { get; set; }
}
