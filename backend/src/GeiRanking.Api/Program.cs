using System.Text.Json.Serialization;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Auth;
using GeiRanking.Api.Endpoints;
using GeiRanking.Domain.Admin;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;
using GeiRanking.Infrastructure.Storage;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddAdminAuth(builder.Configuration, builder.Environment);

var bearer = new BearerSecurityTransformer();
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer(bearer);
    options.AddOperationTransformer(bearer);
});

var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Business rule failures become RFC 9457 problem responses with a stable "code".
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

// Photos: processed and stored behind IPhotoStorage (local disk for now).
var storage = builder.Configuration.GetSection("Storage").Get<LocalPhotoStorageOptions>() ?? new LocalPhotoStorageOptions();
var photosDirectory = Path.IsPathRooted(storage.PhotosPath)
    ? storage.PhotosPath
    : Path.Combine(builder.Environment.ContentRootPath, storage.PhotosPath);
builder.Services.AddSingleton<IPhotoStorage>(new LocalPhotoStorage(photosDirectory, storage.RequestPath));
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = PlayerAdminService.MaxPhotoBytes + 1024 * 1024);

builder.Services.AddScoped<PlayerAdminService>();
builder.Services.AddScoped<MatchAdminService>();

var app = builder.Build();

// Explicit maintenance commands (like migrations, never run on startup):
//   dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking
//   dotnet run --project backend/src/GeiRanking.Api -- seed-admin     (needs Admin__Username and Admin__Password)
if (args.Contains("rebuild-ranking"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<RankingService>().RebuildAsync();
    Console.WriteLine("Ranking rebuilt from events.");
    return;
}

if (args.Contains("seed-admin"))
{
    using var scope = app.Services.CreateScope();
    var created = await AdminSeeder.EnsureAdminAsync(
        scope.ServiceProvider.GetRequiredService<AppDbContext>(),
        scope.ServiceProvider.GetRequiredService<IPasswordHasher<AdminUser>>(),
        app.Configuration["Admin:Username"],
        app.Configuration["Admin:Password"],
        TimeProvider.System);
    Console.WriteLine(created ? "Admin user created." : "That admin user already exists: nothing changed.");
    return;
}

if (app.Services.GetRequiredService<IOptions<JwtSettings>>().Value.SecretIsEphemeral)
{
    app.Logger.LogWarning("No Jwt__Secret configured: using a random one for this run. Admin tokens stop working when the API restarts.");
}

app.UseExceptionHandler();
app.UseCors();

Directory.CreateDirectory(photosDirectory);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(photosDirectory),
    RequestPath = storage.RequestPath,
});

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/openapi/v1.json", "GEI Ranking API v1"));
}

app.MapHealthEndpoints();
app.MapPublicEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();

app.Run();

public partial class Program;
