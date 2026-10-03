using Microsoft.Extensions.Logging;

namespace GeiRanking.Api.Tests.Support;

public sealed record LogEntry(string Category, LogLevel Level, string Message, IReadOnlyDictionary<string, object?> Scope);

/// <summary>Collects what the app logs, together with the scope values (e.g. the admin's name) active when it was written.</summary>
public sealed class CapturingLogProvider : ILoggerProvider, ISupportExternalScope
{
    private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();

    public List<LogEntry> Entries { get; } = [];

    public void SetScopeProvider(IExternalScopeProvider scopeProvider) => _scopes = scopeProvider;

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, this);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(string category, CapturingLogProvider owner) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => owner._scopes.Push(state);

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var scope = new Dictionary<string, object?>();
            owner._scopes.ForEachScope(
                (value, target) =>
                {
                    if (value is IEnumerable<KeyValuePair<string, object>> pairs)
                    {
                        foreach (var (key, item) in pairs)
                        {
                            target[key] = item;
                        }
                    }
                },
                scope);

            lock (owner.Entries)
            {
                owner.Entries.Add(new LogEntry(category, logLevel, formatter(state, exception), scope));
            }
        }
    }
}
