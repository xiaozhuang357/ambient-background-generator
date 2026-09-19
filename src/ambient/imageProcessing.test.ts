import { describe, expect, it } from 'vitest';
import { AMBIENT_PARAMETERS } from './constants';
import { packRgb } from './colorMath';
import {
  applySaturation,
  boxBlurAlphaWeighted,
  channelSpread,
  createMeshBuffer,
  fittedSize,
  pixelRgb,
} from './imageProcessing';
import type { PixelBuffer } from './types';

describe('image geometry', () => {
  it('keeps landscape, portrait and square aspect ratios', () => {
    expect(fittedSize(1920, 1080, 256)).toEqual({ width: 256, height: 144 });
    expect(fittedSize(1080, 1920, 256)).toEqual({ width: 144, height: 256 });
    expect(fittedSize(1200, 1200, 256)).toEqual({ width: 256, height: 256 });
    expect(fittedSize(120, 80, 256)).toEqual({ width: 120, height: 80 });
  });
});

describe('photo backdrop processing', () => {
  it('increases color separation at 1.8 saturation without changing alpha', () => {
    const source = singlePixel(145, 105, 100, 117);
    const saturated = applySaturation(source, AMBIENT_PARAMETERS.saturation);
    expect(channelSpread(pixelRgb(saturated, 0, 0)))
      .toBeGreaterThan(channelSpread(packRgb(145, 105, 100)));
    expect(saturated.data[3]).toBe(117);
  });

  it('blends a hard color boundary', () => {
    const source = horizontalBands(15, 3, (x) => (
      x < 7 ? [220, 20, 20, 255] : [20, 20, 220, 255]
    ));
    const blurred = boxBlurAlphaWeighted(source, [2, 2, 2]);
    const center = pixelRgb(blurred, 7, 1);
    expect((center >>> 16) & 0xff).toBeGreaterThan(20);
    expect(center & 0xff).toBeGreaterThan(20);
  });

  it('keeps transparent edges translucent without leaking hidden black RGB', () => {
    const source = horizontalBands(24, 3, (x) => (
      x < 12 ? [190, 70, 30, 255] : [0, 0, 0, 0]
    ));
    const blurred = boxBlurAlphaWeighted(source, [3, 3, 3]);
    const edgeIndex = (1 * blurred.width + 13) * 4;
    expect(blurred.data[edgeIndex + 3]).toBeGreaterThan(0);
    expect(blurred.data[edgeIndex + 3]).toBeLessThan(255);
    expect(blurred.data[edgeIndex]).toBeGreaterThan(150);
  });

  it('places all four colors at the Mesh corners', () => {
    const colors: [number, number, number, number] = [
      0xff0000,
      0x00ff00,
      0x0000ff,
      0xffffff,
    ];
    const mesh = createMeshBuffer(colors, 5);
    expect(pixelRgb(mesh, 0, 0)).toBe(colors[0]);
    expect(pixelRgb(mesh, 4, 0)).toBe(colors[1]);
    expect(pixelRgb(mesh, 0, 4)).toBe(colors[2]);
    expect(pixelRgb(mesh, 4, 4)).toBe(colors[3]);
  });
});

function singlePixel(red: number, green: number, blue: number, alpha: number): PixelBuffer {
  return { width: 1, height: 1, data: new Uint8ClampedArray([red, green, blue, alpha]) };
}

function horizontalBands(
  width: number,
  height: number,
  painter: (x: number) => readonly [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = painter(x);
      const index = (y * width + x) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = alpha;
    }
  }
  return { width, height, data };
}

