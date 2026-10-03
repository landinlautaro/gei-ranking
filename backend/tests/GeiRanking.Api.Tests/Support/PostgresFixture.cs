using Microsoft.EntityFrameworkCore;
using Npgsql;
using GeiRanking.Infrastructure;

namespace GeiRanking.Api.Tests.Support;

/// <summary>
/// A throwaway PostgreSQL database per test class, created on the local docker-compose server (<c>docker compose up -d</c>)
/// and migrated with the real EF migrations. Override the server with TEST_POSTGRES_ADMIN.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private const string DefaultAdmin = "Host=localhost;Port=5433;Database=postgres;Username=gei;Password=gei_dev_password";

    private readonly string _adminConnectionString =
        Environment.GetEnvironmentVariable("TEST_POSTGRES_ADMIN") ?? DefaultAdmin;

    private readonly string _databaseName = $"gei_test_{Guid.NewGuid():N}";

    public string ConnectionString =>
        new NpgsqlConnectionStringBuilder(_adminConnectionString) { Database = _databaseName, Pooling = false }.ConnectionString;

    public async Task InitializeAsync()
    {
        await ExecuteAdminAsync($"CREATE DATABASE \"{_databaseName}\"");
        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync() =>
        await ExecuteAdminAsync($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)");

    public AppDbContext CreateContext() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .UseSnakeCaseNamingConvention()
            .Options);

    /// <summary>A brand new, completely empty database (no tables, no migrations applied). The caller drops it with the returned action.</summary>
    public async Task<(string ConnectionString, Func<Task> Drop)> CreateEmptyDatabaseAsync()
    {
        var name = $"gei_test_{Guid.NewGuid():N}";
        await ExecuteAdminAsync($"CREATE DATABASE \"{name}\"");
        var connectionString = new NpgsqlConnectionStringBuilder(_adminConnectionString) { Database = name, Pooling = false }.ConnectionString;
        return (connectionString, () => ExecuteAdminAsync($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"));
    }

    /// <summary>Empties every table so each test starts from nothing.</summary>
    public async Task ResetAsync()
    {
        await using var db = CreateContext();
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE ranking_history, ranking_snapshot, ranking_events, matches, players, admin_users RESTART IDENTITY CASCADE");
    }

    private async Task ExecuteAdminAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }
}
