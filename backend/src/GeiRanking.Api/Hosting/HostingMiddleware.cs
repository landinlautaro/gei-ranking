using System.Diagnostics;
using GeiRanking.Api.Admin;

namespace GeiRanking.Api.Hosting;

public static class HostingMiddleware
{
    /// <summary>
    /// Conservative response headers. The API only serves JSON and images, so a strict CSP is safe, except in
    /// Development where Swagger UI needs to load its own scripts.
    /// </summary>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, IHostEnvironment environment) =>
        app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            if (!environment.IsDevelopment())
            {
                headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            }

            await next();
        });

    /// <summary>
    /// Logs who is calling: every log line written while serving an authenticated request carries the admin's user name,
    /// which makes the admin writes (matches, players, adjustments) an audit trail without touching each handler.
    /// </summary>
    public static IApplicationBuilder UseAdminLogScope(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var admin = context.User.FindFirst("name")?.Value;
            if (admin is null)
            {
                await next();
                return;
            }

            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GeiRanking.Audit");
            using (logger.BeginScope(new Dictionary<string, object> { ["Admin"] = admin }))
            {
                await next();
            }
        });

    /// <summary>One line per request: method, path, final status and time. Health checks are logged at Debug to keep the log readable.</summary>
    public static IApplicationBuilder UseRequestLogging(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GeiRanking.Http");
            var stopwatch = Stopwatch.StartNew();
            var status = 0;
            try
            {
                await next();
                status = context.Response.StatusCode;
            }
            catch (Exception ex)
            {
                // The exception handler turns this into a response further out, so the final status is derived here.
                status = ex is ApiProblemException problem ? problem.Status : StatusCodes.Status500InternalServerError;
                throw;
            }
            finally
            {
                var level = context.Request.Path.StartsWithSegments("/api/health")
                    ? LogLevel.Debug
                    : status >= 500 ? LogLevel.Error : LogLevel.Information;
                logger.Log(level, "HTTP {Method} {Path} -> {StatusCode} in {ElapsedMs} ms",
                    context.Request.Method, context.Request.Path.Value, status, stopwatch.ElapsedMilliseconds);
            }
        });
}
