using GeiRanking.Api.Endpoints;
using System.Text.Json.Serialization;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddOpenApi();

var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

// Explicit maintenance command (like migrations, never run on startup):
//   dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking
if (args.Contains("rebuild-ranking"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<RankingService>().RebuildAsync();
    Console.WriteLine("Ranking rebuilt from events.");
    return;
}

app.UseCors();

app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/openapi/v1.json", "GEI Ranking API v1"));
}

app.MapHealthEndpoints();
app.MapPublicEndpoints();

app.Run();

public partial class Program;
