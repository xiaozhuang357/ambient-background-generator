import { blendRgb, blueOf, greenOf, packRgb, redOf } from './colorMath';
import type { PixelBuffer } from './types';

export interface FittedSize {
  readonly width: number;
  readonly height: number;
}

export function fittedSize(width: number, height: number, maximumEdge: number): FittedSize {
  if (width <= 0 || height <= 0 || maximumEdge <= 0) {
    return { width: 0, height: 0 };
  }
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maximumEdge) {
    return { width, height };
  }
  const ratio = maximumEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** 饱和度矩阵：按亮度权重向灰度插值。 */
export function applySaturation(buffer: PixelBuffer, saturation: number): PixelBuffer {
  const output = new Uint8ClampedArray(buffer.data.length);
  const inverse = 1 - saturation;
  const redLuminance = 0.213 * inverse;
  const greenLuminance = 0.715 * inverse;
  const blueLuminance = 0.072 * inverse;

  for (let index = 0; index < buffer.data.length; index += 4) {
    const red = buffer.data[index] ?? 0;
    const green = buffer.data[index + 1] ?? 0;
    const blue = buffer.data[index + 2] ?? 0;
    output[index] = Math.round(
      (redLuminance + saturation) * red + greenLuminance * green + blueLuminance * blue,
    );
    output[index + 1] = Math.round(
      redLuminance * red + (greenLuminance + saturation) * green + blueLuminance * blue,
    );
    output[index + 2] = Math.round(
      redLuminance * red + greenLuminance * green + (blueLuminance + saturation) * blue,
    );
    output[index + 3] = buffer.data[index + 3] ?? 0;
  }

  return { width: buffer.width, height: buffer.height, data: output };
}

/**
 * 多遍 alpha 加权方框模糊。透明像素的隐藏 RGB 不参与均值，避免透明边缘发黑。
 */
export function boxBlurAlphaWeighted(
  buffer: PixelBuffer,
  radii: readonly number[],
): PixelBuffer {
  if (buffer.width <= 0 || buffer.height <= 0 || buffer.data.length === 0) {
    return { width: buffer.width, height: buffer.height, data: new Uint8ClampedArray() };
  }
  const pixels = new Uint8ClampedArray(buffer.data);
  const scratch = new Uint8ClampedArray(buffer.data.length);

  radii.forEach((rawRadius) => {
    const radius = Math.max(0, Math.floor(rawRadius));
    if (radius === 0) return;
    blurHorizontal(pixels, scratch, buffer.width, buffer.height, radius);
    blurVertical(scratch, pixels, buffer.width, buffer.height, radius);
  });

  return { width: buffer.width, height: buffer.height, data: pixels };
}

export function createMeshBuffer(
  colors: readonly [number, number, number, number],
  size = 64,
): PixelBuffer {
  const safeSize = Math.max(2, Math.floor(size));
  const pixels = new Uint8ClampedArray(safeSize * safeSize * 4);
  const [topLeft, topRight, bottomLeft, bottomRight] = colors;

  for (let y = 0; y < safeSize; y += 1) {
    const normalizedY = y / (safeSize - 1);
    for (let x = 0; x < safeSize; x += 1) {
      const normalizedX = x / (safeSize - 1);
      const top = blendRgb(topLeft, topRight, normalizedX);
      const bottom = blendRgb(bottomLeft, bottomRight, normalizedX);
      const rgb = blendRgb(top, bottom, normalizedY);
      const index = (y * safeSize + x) * 4;
      pixels[index] = redOf(rgb);
      pixels[index + 1] = greenOf(rgb);
      pixels[index + 2] = blueOf(rgb);
      pixels[index + 3] = 255;
    }
  }

  return { width: safeSize, height: safeSize, data: pixels };
}

function blurHorizontal(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const sums = new ChannelSums();
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = (y * width + clampIndex(offset, 0, width - 1)) * 4;
      sums.add(source, index, 1);
    }
    for (let x = 0; x < width; x += 1) {
      sums.writeAverage(target, (y * width + x) * 4, window);
      sums.add(
        source,
        (y * width + clampIndex(x - radius, 0, width - 1)) * 4,
        -1,
      );
      sums.add(
        source,
        (y * width + clampIndex(x + radius + 1, 0, width - 1)) * 4,
        1,
      );
    }
  }
}

function blurVertical(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const window = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    const sums = new ChannelSums();
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = (clampIndex(offset, 0, height - 1) * width + x) * 4;
      sums.add(source, index, 1);
    }
    for (let y = 0; y < height; y += 1) {
      sums.writeAverage(target, (y * width + x) * 4, window);
      sums.add(
        source,
        (clampIndex(y - radius, 0, height - 1) * width + x) * 4,
        -1,
      );
      sums.add(
        source,
        (clampIndex(y + radius + 1, 0, height - 1) * width + x) * 4,
        1,
      );
    }
  }
}

function clampIndex(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

class ChannelSums {
  private alpha = 0;
  private redAlpha = 0;
  private greenAlpha = 0;
  private blueAlpha = 0;

  add(source: Uint8ClampedArray, index: number, direction: 1 | -1): void {
    const pixelAlpha = source[index + 3] ?? 0;
    this.alpha += pixelAlpha * direction;
    this.redAlpha += (source[index] ?? 0) * pixelAlpha * direction;
    this.greenAlpha += (source[index + 1] ?? 0) * pixelAlpha * direction;
    this.blueAlpha += (source[index + 2] ?? 0) * pixelAlpha * direction;
  }

  writeAverage(target: Uint8ClampedArray, index: number, window: number): void {
    if (this.alpha <= 0) {
      target[index] = 0;
      target[index + 1] = 0;
      target[index + 2] = 0;
      target[index + 3] = 0;
      return;
    }
    target[index] = Math.round(this.redAlpha / this.alpha);
    target[index + 1] = Math.round(this.greenAlpha / this.alpha);
    target[index + 2] = Math.round(this.blueAlpha / this.alpha);
    target[index + 3] = Math.round(this.alpha / window);
  }
}

/** 测试辅助：返回颜色通道跨度。 */
export function channelSpread(rgb: number): number {
  return Math.max(redOf(rgb), greenOf(rgb), blueOf(rgb))
    - Math.min(redOf(rgb), greenOf(rgb), blueOf(rgb));
}

export function pixelRgb(buffer: PixelBuffer, x: number, y: number): number {
  const index = (y * buffer.width + x) * 4;
  return packRgb(
    buffer.data[index] ?? 0,
    buffer.data[index + 1] ?? 0,
    buffer.data[index + 2] ?? 0,
  );
}
