using AiTodo.Api.Data;
using AiTodo.Api.Endpoints;
using AiTodo.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// All personal data lives in %LOCALAPPDATA%\AiTodo, outside the repo.
var paths = new AppPaths();
var dataDir = paths.DataDir;
builder.Services.AddSingleton(paths);

builder.Services.AddDbContext<AppDb>(o => o.UseSqlite($"Data Source={Path.Combine(dataDir, "aitodo.db")}"));
builder.Services.AddDataProtection()
    .SetApplicationName("AiTodo")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDir, "keys")));
builder.Services.AddScoped<SettingsService>();
builder.Services.AddHttpClient<CanvasFeedService>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(90);
    // Canvas rejects requests with no User-Agent (403), and .NET doesn't send one by default.
    c.DefaultRequestHeaders.UserAgent.ParseAdd("AI-To-Do/1.0 (personal planner)");
});
builder.Services.AddScoped<ClaudeCodeRunner>();
builder.Services.AddScoped<PlannerService>();

// Only listen on this machine.
builder.WebHost.UseUrls(builder.Configuration["urls"] ?? "http://localhost:5080");

// Set by the desktop launcher so the server doesn't linger after the window is closed.
var idleMinutes = builder.Configuration.GetValue<int?>("ExitWhenIdleMinutes");
if (idleMinutes is > 0)
{
    builder.Services.AddSingleton(sp => new IdleShutdownService(
        sp.GetRequiredService<IHostApplicationLifetime>(),
        sp.GetRequiredService<ILogger<IdleShutdownService>>(),
        TimeSpan.FromMinutes(idleMinutes.Value)));
    builder.Services.AddHostedService(sp => sp.GetRequiredService<IdleShutdownService>());
}

var app = builder.Build();

if (app.Services.GetService<IdleShutdownService>() is { } idle)
{
    app.Use(async (ctx, next) =>
    {
        idle.RequestStarted();
        try { await next(); }
        finally { idle.RequestEnded(); }
    });
}

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
}

// index.html must be re-checked on every load so a rebuilt site shows up right away;
// the hashed JS/CSS files it points to can be cached normally.
var staticFiles = new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    },
};

app.UseDefaultFiles();
app.UseStaticFiles(staticFiles);
app.MapApi();
app.MapFallbackToFile("index.html", staticFiles);

app.Run();
