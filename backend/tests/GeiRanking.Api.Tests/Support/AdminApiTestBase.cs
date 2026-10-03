using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Auth;
using GeiRanking.Api.Dtos;
using GeiRanking.Domain.Admin;
using GeiRanking.Domain.Matches;
using GeiRanking.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace GeiRanking.Api.Tests.Support;

/// <summary>
/// Boots the API against a throwaway database with a known admin. <see cref="Admin"/> is logged in, <see cref="Anonymous"/> is not.
/// </summary>
public abstract class AdminApiTestBase(PostgresFixture fixture) : IAsyncLifetime
{
    public const string AdminUsername = "admin";
    public const string AdminPassword = "correct-horse-battery";
    public const string TestSecret = "test-secret-test-secret-test-secret-0123456789";

    protected static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    protected PostgresFixture Fixture { get; } = fixture;

    protected Ladder Ladder { get; } = new(fixture);
    protected string PhotosDirectory { get; private set; } = string.Empty;
    protected WebApplicationFactory<Program> Factory { get; private set; } = null!;
    protected HttpClient Anonymous { get; private set; } = null!;
    protected HttpClient Admin { get; private set; } = null!;

    public virtual async Task InitializeAsync()
    {
        await Fixture.ResetAsync();
        PhotosDirectory = Path.Combine(Path.GetTempPath(), $"gei-photos-{Guid.NewGuid():N}");
        Factory = CreateFactory();
        await SeedAdminAsync(Factory);
        Anonymous = Factory.CreateClient();
        Admin = await LoggedInClientAsync(Factory);
    }

    public virtual async Task DisposeAsync()
    {
        Anonymous.Dispose();
        Admin.Dispose();
        await Factory.DisposeAsync();
        if (Directory.Exists(PhotosDirectory))
        {
            Directory.Delete(PhotosDirectory, recursive: true);
        }
    }

    protected WebApplicationFactory<Program> CreateFactory(Dictionary<string, string?>? extraSettings = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Default", Fixture.ConnectionString);
            builder.UseSetting("Jwt:Secret", TestSecret);
            builder.UseSetting("Storage:PhotosPath", PhotosDirectory);
            builder.UseSetting("RateLimit:LoginPermitPerMinute", "1000");
            foreach (var (key, value) in extraSettings ?? [])
            {
                builder.UseSetting(key, value);
            }
        });

    protected static async Task SeedAdminAsync(WebApplicationFactory<Program> factory)
    {
        using var scope = factory.Services.CreateScope();
        await AdminSeeder.EnsureAdminAsync(
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<IPasswordHasher<AdminUser>>(),
            AdminUsername, AdminPassword, TimeProvider.System);
    }

    protected static async Task<HttpClient> LoggedInClientAsync(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(AdminUsername, AdminPassword));
        response.EnsureSuccessStatusCode();
        var login = (await response.Content.ReadFromJsonAsync<LoginResponse>(Json))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        return client;
    }

    // ---- request helpers ----

    protected Task<HttpResponseMessage> PostAsync(string url, object? body = null) => Admin.PostAsJsonAsync(url, body, Json);

    protected Task<HttpResponseMessage> PutAsync(string url, object body) => Admin.PutAsJsonAsync(url, body, Json);

    protected static async Task<T> ReadAsync<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Json))!;

    protected async Task<T> GetAsync<T>(string url, HttpClient? client = null) =>
        (await (client ?? Admin).GetFromJsonAsync<T>(url, Json))!;

    protected static async Task<(string Code, Dictionary<string, string[]> Errors)> ProblemAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        var errors = root.TryGetProperty("errors", out var e)
            ? e.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(x => x.GetString()!).ToArray())
            : [];
        return (root.GetProperty("code").GetString()!, errors);
    }

    protected Task<List<RankingRowDto>> PublicRankingAsync() => GetAsync<List<RankingRowDto>>("/api/ranking", Anonymous);

    protected async Task<List<int>> PublicOrderAsync() => (await PublicRankingAsync()).Select(r => r.Player.Id).ToList();

    /// <summary>Ids by initial position (1-based).</summary>
    protected List<int> Ids(params int[] initialIndexes) => initialIndexes.Select(i => Ladder.Ids[i - 1]).ToList();

    // ---- domain helpers ----

    protected static MatchScore StraightSets(int challengerSets = 2) =>
        challengerSets == 2
            ? new MatchScore([new SetScore(6, 4), new SetScore(6, 3)])
            : new MatchScore([new SetScore(4, 6), new SetScore(3, 6)]);

    /// <summary>A normal match between players given by initial index; the challenger wins unless <paramref name="challengerWins"/> is false.</summary>
    protected MatchInput Input(int challenger, int challenged, int day = 1, bool challengerWins = true, bool allowOutOfRange = false, string? notes = null) =>
        new(Ladder.Ids[challenger - 1], Ladder.Ids[challenged - 1], Ladder.Start.AddDays(day), CompletionType.Normal,
            StraightSets(challengerWins ? 2 : 0), null, notes, allowOutOfRange);

    protected async Task<MatchChangeResultDto> CreateMatchAsync(MatchInput input)
    {
        var response = await PostAsync("/api/admin/matches", input);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<MatchChangeResultDto>(response);
    }
}
