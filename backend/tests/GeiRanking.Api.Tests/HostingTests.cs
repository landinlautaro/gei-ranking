using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GeiRanking.Api.Auth;
using GeiRanking.Api.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace GeiRanking.Api.Tests;

public class HostingTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private WebApplicationFactory<Program> Production() =>
        CreateFactory().WithWebHostBuilder(builder => builder.UseEnvironment("Production"));

    private (WebApplicationFactory<Program> Factory, CapturingLogProvider Logs) WithCapturedLogs()
    {
        var logs = new CapturingLogProvider();
        var factory = CreateFactory().WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.ClearProviders().AddFilter("GeiRanking", LogLevel.Debug).AddProvider(logs)));
        return (factory, logs);
    }

    // ---- headers and what is exposed ----

    [Fact]
    public async Task Responses_CarryBasicSecurityHeaders()
    {
        var response = await Anonymous.GetAsync("/api/ranking");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.False(response.Headers.Contains("Content-Security-Policy"), "Swagger UI needs scripts in development");
    }

    [Fact]
    public async Task Production_AddsAStrictContentSecurityPolicy_AndHidesTheApiDescription()
    {
        await using var factory = Production();
        using var client = factory.CreateClient();

        var ranking = await client.GetAsync("/api/ranking");
        var openApi = await client.GetAsync("/openapi/v1.json");
        var swagger = await client.GetAsync("/swagger/index.html");

        Assert.Equal("default-src 'none'; frame-ancestors 'none'", ranking.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal(HttpStatusCode.NotFound, openApi.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, swagger.StatusCode);
    }

    [Fact]
    public async Task Development_StillServesTheApiDescription()
    {
        var response = await Anonymous.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Production_DoesNotLeakExceptionDetails()
    {
        await using var factory = Production();
        using var client = factory.CreateClient();

        // The database is unreachable for this host: the health check degrades without exposing the cause.
        await using var broken = Production().WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:Default", "Host=localhost;Port=1;Database=x;Username=x;Password=secret-pw;Timeout=1;Command Timeout=1"));
        using var brokenClient = broken.CreateClient();
        var response = await brokenClient.GetAsync("/api/ranking");

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.DoesNotContain("secret-pw", body);
        Assert.DoesNotContain("Npgsql", body);
        Assert.DoesNotContain("   at ", body);
    }

    [Fact]
    public async Task Photos_AreCachedForever_BecauseEveryUploadHasANewName()
    {
        await Ladder.InitAsync(2);
        using var image = new Image<Rgba32>(500, 500, new Rgba32(10, 100, 200));
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        var content = new MultipartFormDataContent { { new ByteArrayContent(stream.ToArray()) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "file", "f.png" } };
        var uploaded = await ReadAsync<GeiRanking.Api.Admin.AdminPlayerDto>(await Admin.PutAsync($"/api/admin/players/{Ladder.Ids[0]}/photo", content));

        var response = await Anonymous.GetAsync(uploaded.PhotoPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("immutable", response.Headers.CacheControl!.ToString());
        Assert.Contains("max-age=31536000", response.Headers.CacheControl.ToString());
    }

    // ---- logs ----

    [Fact]
    public async Task AdminActions_AreLogged_WithTheAdminsName_AndNeverThePassword()
    {
        var (factory, logs) = WithCapturedLogs();
        await using var _ = factory;
        using var client = await LoggedInClientAsync(factory);
        await Ladder.InitAsync(8);

        var response = await client.PostAsJsonAsync("/api/admin/matches", Input(6, 4), Json);
        response.EnsureSuccessStatusCode();

        var entries = logs.Entries.ToList();
        var login = Assert.Single(entries, e => e.Category == "GeiRanking.Auth" && e.Message.Contains("logged in"));
        Assert.Equal(LogLevel.Information, login.Level);

        var created = Assert.Single(entries, e => e.Message.StartsWith("Match ") && e.Message.Contains("created"));
        Assert.Equal(AdminUsername, created.Scope["Admin"]);
        Assert.Contains("Player 06 vs Player 04", created.Message);

        var request = Assert.Single(entries, e => e.Category == "GeiRanking.Http" && e.Message.StartsWith("HTTP POST /api/admin/matches"));
        Assert.Contains("-> 201", request.Message);
        Assert.Equal(AdminUsername, request.Scope["Admin"]);

        Assert.DoesNotContain(entries, e => e.Message.Contains(AdminPassword));
    }

    [Fact]
    public async Task FailedLogins_AreLogged_WithoutThePassword_AndCannotForgeLogLines()
    {
        var (factory, logs) = WithCapturedLogs();
        await using var _ = factory;
        using var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("ad\r\nFAKE LINE: admin logged in\nmin", "my-secret-guess"));

        var failure = Assert.Single(logs.Entries, e => e.Category == "GeiRanking.Auth");
        Assert.Equal(LogLevel.Warning, failure.Level);
        Assert.StartsWith("Failed admin login for user ", failure.Message);
        Assert.DoesNotContain('\n', failure.Message);
        Assert.DoesNotContain('\r', failure.Message);
        Assert.DoesNotContain("my-secret-guess", string.Join("|", logs.Entries.Select(e => e.Message)));
    }

    [Fact]
    public async Task HealthChecks_AreLoggedAtDebug_ToKeepTheLogReadable_AndFailuresAtError()
    {
        var (factory, logs) = WithCapturedLogs();
        await using var _ = factory;
        using var client = factory.CreateClient();

        await client.GetAsync("/api/health");
        await client.GetAsync("/api/ranking");

        var health = Assert.Single(logs.Entries, e => e.Message.StartsWith("HTTP GET /api/health"));
        var ranking = Assert.Single(logs.Entries, e => e.Message.StartsWith("HTTP GET /api/ranking"));
        Assert.Equal(LogLevel.Debug, health.Level);
        Assert.Equal(LogLevel.Information, ranking.Level);
    }

    [Fact]
    public async Task UnhandledErrors_AreLoggedAsErrors_WithTheFinalStatus()
    {
        var logs = new CapturingLogProvider();
        await using var factory = CreateFactory().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Default", "Host=localhost;Port=1;Database=x;Username=x;Password=x;Timeout=1;Command Timeout=1");
            builder.ConfigureLogging(logging => logging.ClearProviders().AddProvider(logs));
        });
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/ranking");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var line = Assert.Single(logs.Entries, e => e.Category == "GeiRanking.Http");
        Assert.Equal(LogLevel.Error, line.Level);
        Assert.Contains("-> 500", line.Message);
    }

    // ---- migrate command ----

    [Fact]
    public async Task MigrateCommand_CreatesTheSchemaOnAnEmptyDatabase_AndIsSafeToRepeat()
    {
        var (connectionString, drop) = await Fixture.CreateEmptyDatabaseAsync();
        try
        {
            var first = await RunApiCommandAsync("migrate", connectionString);
            var second = await RunApiCommandAsync("migrate", connectionString);

            Assert.Equal(0, first.ExitCode);
            Assert.Contains("Applied 2 migration(s)", first.Output);
            Assert.Equal(0, second.ExitCode);
            Assert.Contains("up to date", second.Output);

            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(
                "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('players','matches','ranking_events','ranking_snapshot','ranking_history','admin_users')",
                connection);
            Assert.Equal(6L, await command.ExecuteScalarAsync());
        }
        finally
        {
            await drop();
        }
    }

    [Fact]
    public async Task ApplicationStartup_NeverAppliesMigrations()
    {
        var (connectionString, drop) = await Fixture.CreateEmptyDatabaseAsync();
        try
        {
            await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseSetting("ConnectionStrings:Default", connectionString);
                builder.UseSetting("Jwt:Secret", TestSecret);
            });
            using var client = factory.CreateClient();
            await client.GetAsync("/api/health");

            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand("select count(*) from information_schema.tables where table_schema = 'public'", connection);
            Assert.Equal(0L, await command.ExecuteScalarAsync());
        }
        finally
        {
            await drop();
        }
    }

    private static async Task<(int ExitCode, string Output)> RunApiCommandAsync(string command, string connectionString)
    {
        var dll = Path.Combine(AppContext.BaseDirectory, "GeiRanking.Api.dll");
        var info = new ProcessStartInfo("dotnet", $"\"{dll}\" {command}")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            Environment =
            {
                ["ConnectionStrings__Default"] = connectionString,
                ["ASPNETCORE_ENVIRONMENT"] = "Production",
                ["Jwt__Secret"] = TestSecret,
            },
        };
        using var process = Process.Start(info)!;
        var output = await process.StandardOutput.ReadToEndAsync();
        var error = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        return (process.ExitCode, output + error);
    }
}
