const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "ico", "bmp", "tiff", "tif",
]);

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function relPath(cwd: string, path: string): string {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
  return path;
}
