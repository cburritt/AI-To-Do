using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace AiTodo.Api.Data;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<TodoItem> Todos => Set<TodoItem>();
    public DbSet<Internship> Internships => Set<Internship>();
    public DbSet<CanvasItem> CanvasItems => Set<CanvasItem>();
    public DbSet<DailyPlan> Plans => Set<DailyPlan>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();

    // SQLite drops DateTimeKind; every DateTime we store is UTC, so mark it as such on the way out.
    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        builder.Properties<DateTime>().HaveConversion<UtcConverter>();
        builder.Properties<DateTime?>().HaveConversion<UtcConverter>();
    }

    private class UtcConverter() : ValueConverter<DateTime, DateTime>(
        v => v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
}
