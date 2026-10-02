using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace GeiRanking.Api.Tests;

public class HealthEndpointTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Health_ReturnsStatusPayload_EvenWhenDatabaseIsUnreachable()
    {
        // Point to a closed port: the endpoint must degrade gracefully (503), not crash.
        using var client = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("ConnectionStrings:Default",
                "Host=localhost;Port=1;Database=x;Username=x;Password=x;Timeout=1;Command Timeout=1"))
            .CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.Equal("error", body!["database"].ToString());
    }

    [Fact]
    public async Task OpenApiDocument_IsServed()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
