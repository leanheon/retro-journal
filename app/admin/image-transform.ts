export type CropAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  grayscale: number;
};

export type ImageTransformOptions = {
  source: string;
  filename?: string;
  crop: CropAreaPixels;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  adjustments: ImageAdjustments;
};

export const MAX_SOURCE_PIXELS = 24_000_000;
export const MAX_SOURCE_HARD_PIXELS = 64_000_000;
export const MAX_OUTPUT_DIMENSION = 4096;
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

type LoadedImage = {
  image: HTMLImageElement;
  scale: number;
  width: number;
  height: number;
};

function safeSourceUrl(source: string): URL {
  if (typeof window === "undefined") {
    throw new Error("브라우저에서만 이미지를 편집할 수 있습니다.");
  }

  let url: URL;
  try {
    url = new URL(source, window.location.href);
  } catch {
    throw new Error("편집할 이미지 주소를 읽지 못했습니다.");
  }

  if (url.protocol === "blob:") return url;
  if (url.origin !== window.location.origin || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("블로그에 올린 이미지나 현재 사이트의 이미지만 편집할 수 있습니다.");
  }
  return url;
}

export function assertSafeImageSource(source: string): void {
  safeSourceUrl(source);
}

function imageErrorMessage(source: string): string {
  const suffix = source.toLowerCase().endsWith(".gif")
    ? " GIF는 첫 프레임을 편집하거나 원본 그대로 넣을 수 있습니다."
    : "";
  return `이미지를 불러오지 못했습니다.${suffix}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  const url = safeSourceUrl(source);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(imageErrorMessage(source)));
    image.src = url.href;
  });
}

async function loadImageWithinBudget(source: string): Promise<LoadedImage> {
  const image = await loadImage(source);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const pixels = width * height;

  if (!width || !height || !Number.isFinite(pixels)) {
    throw new Error("이미지 크기를 확인하지 못했습니다.");
  }
  if (pixels > MAX_SOURCE_HARD_PIXELS) {
    throw new Error("이미지가 너무 큽니다. 6,400만 픽셀 이하의 사진을 사용해 주세요.");
  }

  const scale = pixels > MAX_SOURCE_PIXELS
    ? Math.sqrt(MAX_SOURCE_PIXELS / pixels)
    : 1;

  return {
    image,
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getRotatedSize(width: number, height: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  return {
    width: Math.max(1, Math.round(Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height))),
    height: Math.max(1, Math.round(Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height))),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normaliseCrop(crop: CropAreaPixels, width: number, height: number): CropAreaPixels {
  const x = clamp(Math.round(crop.x), 0, Math.max(0, width - 1));
  const y = clamp(Math.round(crop.y), 0, Math.max(0, height - 1));
  const maxWidth = Math.max(1, width - x);
  const maxHeight = Math.max(1, height - y);
  return {
    x,
    y,
    width: clamp(Math.round(crop.width), 1, maxWidth),
    height: clamp(Math.round(crop.height), 1, maxHeight),
  };
}

function canvasForImage(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 편집용 캔버스를 만들지 못했습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function toFilter(adjustments: ImageAdjustments): string {
  const brightness = clamp(adjustments.brightness, 50, 150);
  const contrast = clamp(adjustments.contrast, 50, 150);
  const grayscale = clamp(adjustments.grayscale, 0, 100);
  return `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%)`;
}

function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const sampleCanvas = document.createElement("canvas");
  const sampleScale = Math.min(1, 128 / canvas.width, 128 / canvas.height);
  sampleCanvas.width = Math.max(1, Math.round(canvas.width * sampleScale));
  sampleCanvas.height = Math.max(1, Math.round(canvas.height * sampleScale));
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return false;
  sampleContext.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const context = sampleContext;
  if (!context) return false;
  const sample = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  for (let index = 3; index < sample.length; index += 4) {
    if (sample[index] < 255) return true;
  }
  return false;
}

function sourcePrefersPng(filename?: string, source?: string): boolean {
  return [filename, source].some(value => /\.(png|gif|webp)(?:$|[?#])/i.test(value ?? ""));
}

async function canvasBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("편집한 이미지를 저장하지 못했습니다.");
  return blob;
}

function resizeCanvas(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const width = Math.max(1, Math.floor(canvas.width * scale));
  const height = Math.max(1, Math.floor(canvas.height * scale));
  const resized = document.createElement("canvas");
  resized.width = width;
  resized.height = height;
  const context = resized.getContext("2d");
  if (!context) throw new Error("출력용 캔버스를 만들지 못했습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, 0, 0, width, height);
  return resized;
}

async function encodeWithinLimit(
  canvas: HTMLCanvasElement,
  preferPng: boolean,
  preserveTransparency: boolean,
): Promise<{ blob: Blob; type: "image/png" | "image/jpeg"; canvas: HTMLCanvasElement }> {
  let outputCanvas = canvas;
  const limitScale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(canvas.width, canvas.height));
  if (limitScale < 1) outputCanvas = resizeCanvas(outputCanvas, limitScale);

  if (preferPng) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const blob = await canvasBlob(outputCanvas, "image/png");
      if (blob.size <= MAX_OUTPUT_BYTES) return { blob, type: "image/png", canvas: outputCanvas };
      const nextScale = Math.max(0.35, Math.sqrt(MAX_OUTPUT_BYTES / blob.size) * 0.9);
      outputCanvas = resizeCanvas(outputCanvas, nextScale);
      if (outputCanvas.width <= 256 || outputCanvas.height <= 256) break;
    }
    if (preserveTransparency) {
      throw new Error("투명도를 보존한 PNG가 8MB를 넘습니다. 사진을 조금 더 자르거나 작은 원본을 사용해 주세요.");
    }
  }

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const quality = Math.max(0.52, 0.9 - attempt * 0.06);
    const blob = await canvasBlob(outputCanvas, "image/jpeg", quality);
    if (blob.size <= MAX_OUTPUT_BYTES) return { blob, type: "image/jpeg", canvas: outputCanvas };
    const nextScale = Math.max(0.35, Math.sqrt(MAX_OUTPUT_BYTES / blob.size) * 0.9);
    outputCanvas = resizeCanvas(outputCanvas, nextScale);
    if (outputCanvas.width <= 256 || outputCanvas.height <= 256) break;
  }

  throw new Error("편집한 이미지가 너무 큽니다. 자르거나 더 작은 원본을 사용해 주세요.");
}

function outputName(filename: string | undefined, type: "image/png" | "image/jpeg"): string {
  const fallback = "edited-image";
  const original = filename?.trim() || fallback;
  const base = original.replace(/\.[^./\\]+$/, "").replace(/[^\w가-힣 ._-]+/g, "-").trim() || fallback;
  return `${base}-edited.${type === "image/png" ? "png" : "jpg"}`;
}

export async function transformImage(options: ImageTransformOptions): Promise<File> {
  const loaded = await loadImageWithinBudget(options.source);
  const sourceCanvas = canvasForImage(loaded.image, loaded.width, loaded.height);
  const rotatedSize = getRotatedSize(loaded.width, loaded.height, options.rotation);
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedSize.width;
  rotatedCanvas.height = rotatedSize.height;
  const rotatedContext = rotatedCanvas.getContext("2d");
  if (!rotatedContext) throw new Error("회전용 캔버스를 만들지 못했습니다.");
  rotatedContext.imageSmoothingEnabled = true;
  rotatedContext.imageSmoothingQuality = "high";
  rotatedContext.translate(rotatedSize.width / 2, rotatedSize.height / 2);
  rotatedContext.rotate((options.rotation * Math.PI) / 180);
  rotatedContext.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  rotatedContext.drawImage(sourceCanvas, -loaded.width / 2, -loaded.height / 2, loaded.width, loaded.height);

  const crop = normaliseCrop(
    {
      x: options.crop.x * loaded.scale,
      y: options.crop.y * loaded.scale,
      width: options.crop.width * loaded.scale,
      height: options.crop.height * loaded.scale,
    },
    rotatedCanvas.width,
    rotatedCanvas.height,
  );
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = crop.width;
  croppedCanvas.height = crop.height;
  const croppedContext = croppedCanvas.getContext("2d");
  if (!croppedContext) throw new Error("자르기용 캔버스를 만들지 못했습니다.");
  croppedContext.imageSmoothingEnabled = true;
  croppedContext.imageSmoothingQuality = "high";
  croppedContext.filter = toFilter(options.adjustments);
  croppedContext.drawImage(
    rotatedCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const preserveTransparency = hasAlpha(croppedCanvas);
  const preferPng = sourcePrefersPng(options.filename, options.source) || preserveTransparency;
  const encoded = await encodeWithinLimit(croppedCanvas, preferPng, preserveTransparency);
  return new File([encoded.blob], outputName(options.filename, encoded.type), {
    type: encoded.type,
    lastModified: Date.now(),
  });
}
