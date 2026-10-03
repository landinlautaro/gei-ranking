using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace GeiRanking.Infrastructure.Storage;

public sealed class InvalidPhotoException(string code) : Exception(code)
{
    /// <summary>Machine readable reason: <c>unsupported_format</c> or <c>unreadable_image</c>.</summary>
    public string Code { get; } = code;
}

/// <summary>
/// Decodes an uploaded image, applies its orientation, crops it to a square and re-encodes it as JPEG.
/// Re-encoding drops metadata (EXIF, GPS) and anything that is not pixels.
/// </summary>
public static class PhotoProcessor
{
    public const int Size = 400;

    public static async Task<MemoryStream> ProcessAsync(Stream upload, CancellationToken ct = default)
    {
        var buffer = new MemoryStream();
        await upload.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        IImageFormat? format;
        try
        {
            format = await Image.DetectFormatAsync(buffer, ct);
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException or NotSupportedException)
        {
            throw new InvalidPhotoException("unsupported_format");
        }

        if (format is not (JpegFormat or PngFormat or WebpFormat))
        {
            throw new InvalidPhotoException("unsupported_format");
        }

        buffer.Position = 0;
        try
        {
            using var image = await Image.LoadAsync(buffer, ct);
            image.Mutate(x => x.AutoOrient().Resize(new ResizeOptions { Size = new Size(Size, Size), Mode = ResizeMode.Crop }));

            var output = new MemoryStream();
            await image.SaveAsJpegAsync(output, new JpegEncoder { Quality = 85 }, ct);
            output.Position = 0;
            return output;
        }
        catch (Exception ex) when (ex is InvalidImageContentException or UnknownImageFormatException or ImageProcessingException)
        {
            throw new InvalidPhotoException("unreadable_image");
        }
    }
}
