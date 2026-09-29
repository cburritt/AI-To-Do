using AiTodo.Api.Data;
using AiTodo.Api.Endpoints;
using AiTodo.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// All personal data lives in %LOCALAPPDATA%\AiTodo, outside the repo.
var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AiTodo");
Directory.CreateDirectory(dataDir);

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
builder.Services.AddScoped<PlannerService>();

// Only listen on this machine.
builder.WebHost.UseUrls(builder.Configuration["urls"] ?? "http://localhost:5080");

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapApi();
app.MapFallbackToFile("index.html");

app.Run();
