export function isPhotoUpload(name: string, mimeType: string, folderName?: string | null) {
  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  const lowerFolder = (folderName ?? '').toLowerCase();
  return (
    lowerMime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(lowerName) ||
    /\b(photo|photos|picture|pictures|field photos)\b/.test(lowerFolder)
  );
}
