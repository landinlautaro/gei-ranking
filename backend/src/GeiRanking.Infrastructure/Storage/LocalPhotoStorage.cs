namespace GeiRanking.Infrastructure.Storage;

public sealed class LocalPhotoStorageOptions
{
    /// <summary>Directory on disk. Env var: Storage__PhotosPath.</summary>
    public string PhotosPath { get; set; } = Path.Combine("uploads", "photos");

    /// <summary>URL prefix the directory is served from.</summary>
    public string RequestPath { get; set; } = "/photos";
}

public sealed class LocalPhotoStorage(string rootPath, string requestPath) : IPhotoStorage
{
    private readonly string _root = Path.GetFullPath(rootPath);

    public async Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default)
    {
        var target = ResolveInsideRoot(fileName);
        Directory.CreateDirectory(_root);
        await using var file = File.Create(target);
        await content.CopyToAsync(file, ct);
        return $"{requestPath.TrimEnd('/')}/{Path.GetFileName(target)}";
    }

    public Task DeleteAsync(string photoPath, CancellationToken ct = default)
    {
        var prefix = requestPath.TrimEnd('/') + "/";
        if (photoPath.StartsWith(prefix, StringComparison.Ordinal))
        {
            var target = ResolveInsideRoot(photoPath[prefix.Length..]);
            if (File.Exists(target))
            {
                File.Delete(target);
            }
        }

        return Task.CompletedTask;
    }

    /// <summary>Only plain file names inside the photos directory are accepted: no separators, no traversal.</summary>
    private string ResolveInsideRoot(string fileName)
    {
        if (fileName != Path.GetFileName(fileName) || fileName is "" or "." or "..")
        {
            throw new ArgumentException("Invalid photo file name.", nameof(fileName));
        }

        return Path.Combine(_root, fileName);
    }
}
