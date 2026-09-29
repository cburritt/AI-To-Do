namespace AiTodo.Api.Services;

/// <summary>
/// When the desktop launcher starts the app with <c>--ExitWhenIdleMinutes N</c>, stops the server once
/// no request has arrived for N minutes. The open app window pings /api/ping every minute, so this
/// only happens after the window is closed.
/// </summary>
public class IdleShutdownService(IHostApplicationLifetime lifetime, ILogger<IdleShutdownService> log, TimeSpan idleLimit)
    : BackgroundService
{
    private long _lastActivityTicks = DateTime.UtcNow.Ticks;
    private int _inFlight;

    public void RequestStarted()
    {
        Interlocked.Increment(ref _inFlight);
        Interlocked.Exchange(ref _lastActivityTicks, DateTime.UtcNow.Ticks);
    }

    public void RequestEnded()
    {
        Interlocked.Decrement(ref _inFlight);
        Interlocked.Exchange(ref _lastActivityTicks, DateTime.UtcNow.Ticks);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var idle = DateTime.UtcNow - new DateTime(Interlocked.Read(ref _lastActivityTicks), DateTimeKind.Utc);
            if (Volatile.Read(ref _inFlight) == 0 && idle > idleLimit)
            {
                log.LogInformation("No activity for {Minutes:0} minutes; shutting down.", idle.TotalMinutes);
                lifetime.StopApplication();
                return;
            }
        }
    }
}
