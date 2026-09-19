import { AMBIENT_PARAMETERS } from './constants';
import {
  applySaturation,
  boxBlurAlphaWeighted,
  createMeshBuffer,
  fittedSize,
} from './imageProcessing';
import { extractNumericPalette, toAmbientAnalysis } from './palette';
import type {
  AmbientAnalysis,
  AmbientImageSource,
  AmbientRenderOptions,
  AmbientRenderResult,
  PixelBuffer,
} from './types';

interface DecodedSource {
  readonly image: Exclude<AmbientImageSource, Blob>;
  readonly width: number;
  readonly height: number;
  readonly release: () => void;
}

export async function analyzeAmbientImage(source: AmbientImageSource): Promise<AmbientAnalysis> {
  const decoded = await decodeSource(source);
  try {
    const paletteBuffer = drawToPixelBuffer(
      decoded.image,
      decoded.width,
      decoded.height,
      AMBIENT_PARAMETERS.samplingMaxEdge,
    );
    return toAmbientAnalysis(extractNumericPalette(paletteBuffer));
  } finally {
    decoded.release();
  }
}

export async function generateAmbientBackground(
  source: AmbientImageSource,
  options: AmbientRenderOptions,
): Promise<AmbientRenderResult> {
  const outputWidth = normalizeOutputDimension(options.width, 'width');
  const outputHeight = normalizeOutputDimension(options.height, 'height');
  const decoded = await decodeSource(source);

  try {
    // 取色与背景必须分别派生，不能把 152px 中心取色裁切复用于背景。
    const paletteBuffer = drawToPixelBuffer(
      decoded.image,
      decoded.width,
      decoded.height,
      AMBIENT_PARAMETERS.samplingMaxEdge,
    );
    const numericAnalysis = extractNumericPalette(paletteBuffer);

    const originalBackdrop = drawToPixelBuffer(
      decoded.image,
      decoded.width,
      decoded.height,
      AMBIENT_PARAMETERS.backdropMaxEdge,
    );
    const saturatedBackdrop = applySaturation(
      originalBackdrop,
      AMBIENT_PARAMETERS.saturation,
    );
    const blurredBackdrop = boxBlurAlphaWeighted(
      saturatedBackdrop,
      AMBIENT_PARAMETERS.blurRadii,
    );

    const canvas = createCanvas(outputWidth, outputHeight);
    const context = requireContext(canvas);
    context.fillStyle = AMBIENT_PARAMETERS.semanticBaseColor;
    context.fillRect(0, 0, outputWidth, outputHeight);

    const meshCanvas = canvasFromBuffer(createMeshBuffer(numericAnalysis.meshRgbs));
    context.save();
    context.globalAlpha = AMBIENT_PARAMETERS.meshAlpha;
    context.drawImage(meshCanvas, 0, 0, outputWidth, outputHeight);
    context.restore();

    const backdropCanvas = canvasFromBuffer(blurredBackdrop);
    context.save();
    context.globalAlpha = AMBIENT_PARAMETERS.backdropAlpha;
    drawImageCover(context, backdropCanvas, outputWidth, outputHeight);
    context.restore();

    context.save();
    context.globalAlpha = numericAnalysis.scrimAlpha / 255;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.restore();

    return {
      canvas,
      analysis: toAmbientAnalysis(numericAnalysis),
    };
  } finally {
    decoded.release();
  }
}

function drawToPixelBuffer(
  source: Exclude<AmbientImageSource, Blob>,
  sourceWidth: number,
  sourceHeight: number,
  maximumEdge: number,
): PixelBuffer {
  const target = fittedSize(sourceWidth, sourceHeight, maximumEdge);
  if (target.width <= 0 || target.height <= 0) {
    throw new Error('图片尺寸无效');
  }
  const canvas = createCanvas(target.width, target.height);
  const context = requireContext(canvas, true);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0, target.width, target.height);
  const imageData = context.getImageData(0, 0, target.width, target.height);
  return {
    width: target.width,
    height: target.height,
    data: new Uint8ClampedArray(imageData.data),
  };
}

function canvasFromBuffer(buffer: PixelBuffer): HTMLCanvasElement {
  const canvas = createCanvas(buffer.width, buffer.height);
  const context = requireContext(canvas);
  context.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0);
  return canvas;
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
): void {
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : 0;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (targetWidth - drawWidth) / 2,
    (targetHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

async function decodeSource(source: AmbientImageSource): Promise<DecodedSource> {
  if (source instanceof Blob) {
    return decodeBlob(source);
  }
  if (isHtmlImage(source)) {
    if (!source.complete || source.naturalWidth <= 0) {
      await source.decode();
    }
    return decoded(source, source.naturalWidth, source.naturalHeight);
  }
  if (isImageBitmap(source)) {
    return decoded(source, source.width, source.height);
  }
  if (isHtmlCanvas(source) || isOffscreenCanvas(source)) {
    return decoded(source, source.width, source.height);
  }
  throw new TypeError('不支持的图片来源');
}

async function decodeBlob(blob: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Safari 某些版本的 createImageBitmap 对图片格式支持不完整，回退到 Image。
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('无法解码该图片'));
      image.src = objectUrl;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function decoded(
  image: Exclude<AmbientImageSource, Blob>,
  width: number,
  height: number,
): DecodedSource {
  if (width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效');
  }
  return { image, width, height, release: () => undefined };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function requireContext(canvas: HTMLCanvasElement, frequentReads = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: frequentReads });
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D');
  }
  return context;
}

function normalizeOutputDimension(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} 必须是正数`);
  }
  return Math.max(1, Math.round(value));
}

function isHtmlImage(source: AmbientImageSource): source is HTMLImageElement {
  return typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement;
}

function isHtmlCanvas(source: AmbientImageSource): source is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement;
}

function isImageBitmap(source: AmbientImageSource): source is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;
}

function isOffscreenCanvas(source: AmbientImageSource): source is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas;
}

