/**
 * Shrinks a phone photo before upload: longest side 1280px, JPEG. A 4–8 MB camera photo becomes about
 * 120–250 KB, so uploads are quick on mobile data and the database stays small.
 */
export async function resizeForUpload(file: File, maxSide = 1280, quality = 0.75): Promise<string> {
  const source = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('เตรียมรูปไม่สำเร็จ');
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  if ('close' in source.image) source.image.close();
  return canvas.toDataURL('image/jpeg', quality);
}

export async function loadImage(file: File): Promise<{ image: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  // createImageBitmap follows the photo's rotation (EXIF) where supported; fall back to an <img>.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { image: img, width: img.naturalWidth, height: img.naturalHeight };
    } catch { throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองถ่ายใหม่หรือเลือกรูปอื่น'); }
    finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
