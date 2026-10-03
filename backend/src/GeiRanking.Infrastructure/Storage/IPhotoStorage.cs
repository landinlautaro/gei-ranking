namespace GeiRanking.Infrastructure.Storage;

/// <summary>
/// Where processed player photos live. Local disk today; implement this to move them to a file service later.
/// Paths returned by <see cref="SaveAsync"/> are what gets stored in the database (never the bytes).
/// </summary>
public interface IPhotoStorage
{
    /// <summary>Stores the image under <paramref name="fileName"/> and returns the public path to put in <c>PhotoPath</c>.</summary>
    Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default);

    /// <summary>Deletes a previously saved photo. A missing file is not an error.</summary>
    Task DeleteAsync(string photoPath, CancellationToken ct = default);
}
