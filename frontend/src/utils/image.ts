export async function compressImageFile(file: File, maxSize = 1600, quality = 0.72): Promise<string> {
  const toDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
      reader.readAsDataURL(file);
    });

  try {
    const dataUrl = await toDataURL(file);
    const img = new Image();
    img.src = dataUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const { width, height } = img;
    if (!width || !height) return dataUrl;

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn('Compression image échouée, fallback base64', err);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
      reader.readAsDataURL(file);
    });
  }
}
