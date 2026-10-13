using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;

namespace AiTodo.Api.Services;

public record InboxItem(string From, string Subject, string? Preview, DateTimeOffset Date, string? Url);

/// <summary>
/// Reads unread Primary-tab mail from the user's Gmail over IMAP with an app password. The inbox is opened
/// read-only, so nothing is ever marked as read, moved, or deleted. Mail is fetched live, not saved.
/// </summary>
public class EmailService(SettingsService settings, ILogger<EmailService> log)
{
    public const int LookbackDays = 7;
    public const int MaxItems = 25;

    public record InboxResult(bool Connected, string? Error, List<InboxItem> Items);

    // Signing in on every tab switch makes Gmail slow to answer, so a recent result is reused.
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(2);
    private static (string Address, DateTime AtUtc, List<InboxItem> Items)? _cache;

    /// <param name="refresh">Skip the saved copy and ask Gmail again.</param>
    public async Task<InboxResult> UnreadAsync(bool refresh = false, CancellationToken ct = default)
    {
        var address = await settings.GetAsync(SettingsService.GmailAddress);
        var password = await settings.GetAsync(SettingsService.GmailAppPassword);
        if (address is null || password is null) return new(false, null, []);

        if (!refresh && _cache is { } cached && cached.Address == address && DateTime.UtcNow - cached.AtUtc < CacheFor)
            return new(true, null, cached.Items);

        try
        {
            List<InboxItem> items;
            // Gmail occasionally leaves a sign-in hanging; a second attempt goes straight through.
            try { items = await FetchAsync(address, password, ct); }
            catch (Exception ex) when (ex is IOException or TimeoutException)
            {
                log.LogInformation(ex, "Gmail stalled, retrying once");
                items = await FetchAsync(address, password, ct);
            }
            _cache = (address, DateTime.UtcNow, items);
            return new(true, null, items);
        }
        catch (AuthenticationException ex)
        {
            log.LogWarning(ex, "Gmail sign-in failed");
            return new(true, "Gmail rejected the address or app password. Check them in Settings.", []);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Gmail fetch failed");
            return new(true, "Couldn't reach Gmail. Check your internet connection and try again.", []);
        }
    }

    private static async Task<List<InboxItem>> FetchAsync(string address, string password, CancellationToken ct)
    {
        using var client = new ImapClient { Timeout = 8_000 };
        await client.ConnectAsync("imap.gmail.com", 993, SecureSocketOptions.SslOnConnect, ct);
        // Google shows app passwords in groups of four with spaces.
        await client.AuthenticateAsync(address, password.Replace(" ", ""), ct);
        await client.Inbox.OpenAsync(FolderAccess.ReadOnly, ct);

        // Gmail's own search syntax: only the Primary tab, so Promotions, Social, and Updates are left out.
        var uids = await client.Inbox.SearchAsync(
            SearchQuery.GMailRawSearch($"is:unread category:primary newer_than:{LookbackDays}d"), ct);
        var summaries = await client.Inbox.FetchAsync(uids.TakeLast(MaxItems).ToList(),
            MessageSummaryItems.Envelope | MessageSummaryItems.InternalDate |
            MessageSummaryItems.PreviewText | MessageSummaryItems.GMailThreadId, ct);
        await client.DisconnectAsync(true, ct);

        return summaries.OrderByDescending(m => m.InternalDate).Select(m =>
        {
            var sender = m.Envelope?.From.Mailboxes.FirstOrDefault();
            return new InboxItem(
                string.IsNullOrWhiteSpace(sender?.Name) ? sender?.Address ?? "Unknown sender" : sender.Name,
                string.IsNullOrWhiteSpace(m.Envelope?.Subject) ? "(no subject)" : m.Envelope.Subject,
                string.IsNullOrWhiteSpace(m.PreviewText) ? null : m.PreviewText.Trim(),
                m.InternalDate ?? m.Envelope?.Date ?? DateTimeOffset.Now,
                m.GMailThreadId is { } id ? $"https://mail.google.com/mail/u/0/#inbox/{id:x}" : null);
        }).ToList();
    }
}
