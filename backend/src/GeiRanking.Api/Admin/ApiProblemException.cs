using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace GeiRanking.Api.Admin;

/// <summary>
/// A business rule failure that maps to an HTTP problem (RFC 9457). <see cref="Code"/> is a stable machine readable
/// identifier the UI translates; <see cref="Errors"/> are field errors whose values are codes too.
/// </summary>
public sealed class ApiProblemException(int status, string code, string detail, IDictionary<string, string[]>? errors = null)
    : Exception(detail)
{
    public int Status { get; } = status;

    public string Code { get; } = code;

    public IDictionary<string, string[]>? Errors { get; } = errors;

    public static ApiProblemException NotFound(string what) => new(StatusCodes.Status404NotFound, "NotFound", $"{what} not found.");

    public static ApiProblemException Conflict(string code, string detail) => new(StatusCodes.Status409Conflict, code, detail);

    public static ApiProblemException Invalid(string field, params string[] codes) =>
        new(StatusCodes.Status422UnprocessableEntity, "ValidationFailed", "One or more fields are invalid.",
            new Dictionary<string, string[]> { [field] = codes });
}

internal sealed class ApiExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not ApiProblemException problem)
        {
            return false;
        }

        httpContext.Response.StatusCode = problem.Status;
        ProblemDetails details = problem.Errors is null
            ? new ProblemDetails { Status = problem.Status, Title = problem.Code, Detail = problem.Message }
            : new ValidationProblemDetails(problem.Errors) { Status = problem.Status, Title = problem.Code, Detail = problem.Message };
        details.Extensions["code"] = problem.Code;

        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = details, Exception = exception });
    }
}
