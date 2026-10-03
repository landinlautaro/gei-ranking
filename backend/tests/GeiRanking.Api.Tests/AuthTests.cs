using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GeiRanking.Api.Auth;
using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Admin;
using GeiRanking.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace GeiRanking.Api.Tests;

public class AuthTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private Task<HttpResponseMessage> LoginAsync(string? username, string? password) =>
        Anonymous.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, password));

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsAWorkingToken()
    {
        var response = await LoginAsync(AdminUsername, AdminPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var login = await ReadAsync<LoginResponse>(response);
        Assert.True(login.ExpiresAt > DateTimeOffset.UtcNow.AddHours(7));

        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        var me = await client.GetAsync("/api/admin/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(AdminUsername, (await ReadAsync<MeResponse>(me)).Username);
    }

    [Fact]
    public async Task Login_IsCaseInsensitiveOnUsername()
    {
        var response = await LoginAsync("  ADMIN ", AdminPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("admin", "wrong-password")]
    [InlineData("nobody", AdminApiTestBase.AdminPassword)]
    [InlineData("admin", "")]
    [InlineData("", "")]
    [InlineData(null, null)]
    public async Task Login_WithBadCredentials_Is401_WithTheSameAnswer(string? username, string? password)
    {
        var response = await LoginAsync(username, password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("InvalidCredentials", (await ProblemAsync(response)).Code);
    }

    [Theory]
    [InlineData("GET", "/api/admin/me")]
    [InlineData("GET", "/api/admin/players")]
    [InlineData("GET", "/api/admin/players/1")]
    [InlineData("POST", "/api/admin/players")]
    [InlineData("PUT", "/api/admin/players/1")]
    [InlineData("POST", "/api/admin/players/1/deactivate")]
    [InlineData("POST", "/api/admin/players/1/reactivate")]
    [InlineData("PUT", "/api/admin/players/1/photo")]
    [InlineData("DELETE", "/api/admin/players/1/photo")]
    [InlineData("GET", "/api/admin/matches")]
    [InlineData("GET", "/api/admin/matches/1")]
    [InlineData("POST", "/api/admin/matches/preview")]
    [InlineData("POST", "/api/admin/matches")]
    [InlineData("PUT", "/api/admin/matches/1")]
    [InlineData("POST", "/api/admin/matches/1/void")]
    [InlineData("POST", "/api/admin/ranking/adjustments")]
    public async Task AdminEndpoints_RejectRequestsWithoutToken(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);

        var response = await Anonymous.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AdminEndpoints_RejectGarbageAndForeignTokens()
    {
        using var garbage = Factory.CreateClient();
        garbage.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");
        Assert.Equal(HttpStatusCode.Unauthorized, (await garbage.GetAsync("/api/admin/players")).StatusCode);

        // A valid token signed by another API instance (different secret) must not be accepted here.
        await using var other = CreateFactory(new() { ["Jwt:Secret"] = "another-secret-another-secret-another-secret-9999" });
        using var foreign = await LoggedInClientAsync(other);
        var foreignToken = foreign.DefaultRequestHeaders.Authorization!.Parameter!;
        using var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", foreignToken);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/players")).StatusCode);
    }

    [Fact]
    public async Task ExpiredTokens_AreRejected()
    {
        await using var shortLived = CreateFactory(new() { ["Jwt:ExpiresMinutes"] = "-10" });
        using var client = await LoggedInClientAsync(shortLived);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/players")).StatusCode);
    }

    [Fact]
    public async Task PublicEndpoints_StayOpen()
    {
        foreach (var url in new[] { "/api/ranking", "/api/players", "/api/matches", "/api/health" })
        {
            var response = await Anonymous.GetAsync(url);
            Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task Login_IsRateLimited()
    {
        await using var limited = CreateFactory(new() { ["RateLimit:LoginPermitPerMinute"] = "3" });
        using var client = limited.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 5; i++)
        {
            statuses.Add((await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(AdminUsername, "wrong"))).StatusCode);
        }

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests, HttpStatusCode.TooManyRequests], statuses);
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    public void Production_RefusesToStartWithoutAStrongJwtSecret(string secret)
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("ConnectionStrings:Default", Fixture.ConnectionString);
            builder.UseSetting("Jwt:Secret", secret);
        });

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }

    // ---- first admin seed ----

    [Fact]
    public async Task SeedAdmin_StoresAHash_NeverThePassword_AndNeverOverwrites()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AdminUser>>();

        var createdAgain = await AdminSeeder.EnsureAdminAsync(db, hasher, "Admin", "another-password-123", TimeProvider.System);
        var stored = await db.AdminUsers.AsNoTracking().SingleAsync();

        Assert.False(createdAgain);
        Assert.NotEqual(AdminPassword, stored.PasswordHash);
        Assert.DoesNotContain(AdminPassword, stored.PasswordHash);
        Assert.Equal(PasswordVerificationResult.Success, hasher.VerifyHashedPassword(stored, stored.PasswordHash, AdminPassword));
    }

    [Fact]
    public async Task SeedAdmin_CreatesANewUser_AndNormalizesTheUsername()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AdminUser>>();

        var created = await AdminSeeder.EnsureAdminAsync(db, hasher, "  Secretaria ", "a-long-enough-password", TimeProvider.System);

        Assert.True(created);
        Assert.True(await db.AdminUsers.AnyAsync(a => a.Username == "secretaria"));
    }

    [Theory]
    [InlineData(null, "a-long-enough-password")]
    [InlineData("  ", "a-long-enough-password")]
    [InlineData("someone", null)]
    [InlineData("someone", "short")]
    public async Task SeedAdmin_RejectsMissingOrWeakInput(string? username, string? password)
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AdminUser>>();

        await Assert.ThrowsAsync<InvalidOperationException>(() => AdminSeeder.EnsureAdminAsync(db, hasher, username, password, TimeProvider.System));
    }

    [Fact]
    public void JwtSettings_RequireALongSecret()
    {
        Assert.False(new JwtSettings { Secret = "short" }.HasValidSecret);
        Assert.False(new JwtSettings { Secret = null }.HasValidSecret);
        Assert.True(new JwtSettings { Secret = new string('x', JwtSettings.MinSecretLength) }.HasValidSecret);
        Assert.Throws<InvalidOperationException>(() => new JwtSettings { Secret = "short" }.SigningKey());
        _ = Options.Create(new JwtSettings());
    }
}
