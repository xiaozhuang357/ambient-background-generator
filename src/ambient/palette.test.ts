import { describe, expect, it } from 'vitest';
import { AMBIENT_PARAMETERS } from './constants';
import { hueDistance, rgbToHsl } from './colorMath';
import {
  deriveMeshColors,
  extractNumericPalette,
  scrimAlphaFor,
  toAmbientAnalysis,
} from './palette';
import type { PixelBuffer } from './types';

const SIDE = 152;
const SKY = 0x81b6e6;
const GROUND = 0x907d69;
const WARM = 0xb4601f;
const COOL_GRAY = 0x8a9498;

describe('photo palette extraction', () => {
  it('keeps the blue-sky family instead of producing a muddy average', () => {
    const buffer = createBuffer(SIDE, SIDE, (_x, y) => ({
      rgb: y < SIDE * 2 / 3 ? SKY : GROUND,
      alpha: 255,
    }));
    const result = extractNumericPalette(buffer);
    const hsl = rgbToHsl(result.dominantRgb);

    expect(hsl.hue).toBeGreaterThanOrEqual(195);
    expect(hsl.hue).toBeLessThanOrEqual(225);
    expect(hsl.saturation).toBeGreaterThanOrEqual(0.55);
    expect(result.meshRgbs).toHaveLength(4);
  });

  it('lets the independently weighted center region win', () => {
    const buffer = createBuffer(SIDE, SIDE, (x, y) => ({
      rgb: isInnerCenter(x, y) ? WARM : COOL_GRAY,
      alpha: 255,
    }));
    const hsl = rgbToHsl(extractNumericPalette(buffer).dominantRgb);

    expect(hsl.hue).toBeLessThanOrEqual(45);
    expect(hsl.saturation).toBeGreaterThanOrEqual(0.35);
  });

  it('keeps black, white and alpha-190 samples', () => {
    expect(extractNumericPalette(solidBuffer(0x000000, 255)).dominantRgb).toBe(0x000000);
    expect(extractNumericPalette(solidBuffer(0xffffff, 255)).dominantRgb).toBe(0xffffff);
    expect(extractNumericPalette(solidBuffer(WARM, 190)).dominantRgb).toBe(WARM);
  });

  it('rejects samples below the alpha threshold', () => {
    const belowThreshold = extractNumericPalette(solidBuffer(WARM, 189));
    const transparent = extractNumericPalette(solidBuffer(WARM, 0));
    expect(belowThreshold.dominantRgb).toBe(AMBIENT_PARAMETERS.fallbackRgb);
    expect(transparent.dominantRgb).toBe(AMBIENT_PARAMETERS.fallbackRgb);
  });

  it('derives the four Mesh hue offsets without changing saturation or lightness', () => {
    const dominant = 0xb54f12;
    const dominantHsl = rgbToHsl(dominant);
    const colors = deriveMeshColors(dominant);

    colors.forEach((color, index) => {
      const actual = rgbToHsl(color);
      const shift = AMBIENT_PARAMETERS.hueShifts[index] ?? 0;
      const expectedHue = (dominantHsl.hue + shift + 360) % 360;
      expect(hueDistance(actual.hue, expectedHue)).toBeLessThanOrEqual(1);
      expect(actual.saturation).toBeCloseTo(dominantHsl.saturation, 2);
      expect(actual.lightness).toBeCloseTo(dominantHsl.lightness, 2);
    });
  });

  it('clamps and exposes the dynamic black scrim alpha', () => {
    expect(scrimAlphaFor(0)).toBe(0x36);
    expect(scrimAlphaFor(0.5)).toBe(0x60);
    expect(scrimAlphaFor(1)).toBe(0x78);

    const publicResult = toAmbientAnalysis(extractNumericPalette(solidBuffer(SKY, 255)));
    expect(publicResult.dominantColor).toMatch(/^#[0-9A-F]{6}$/);
    expect(publicResult.meshColors).toHaveLength(4);
    expect(publicResult.scrimAlpha).toBeGreaterThanOrEqual(0x36);
    expect(publicResult.scrimAlpha).toBeLessThanOrEqual(0x78);
  });
});

function solidBuffer(rgb: number, alpha: number): PixelBuffer {
  return createBuffer(SIDE, SIDE, () => ({ rgb, alpha }));
}

function createBuffer(
  width: number,
  height: number,
  painter: (x: number, y: number) => { rgb: number; alpha: number },
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = painter(x, y);
      const index = (y * width + x) * 4;
      data[index] = (pixel.rgb >>> 16) & 0xff;
      data[index + 1] = (pixel.rgb >>> 8) & 0xff;
      data[index + 2] = pixel.rgb & 0xff;
      data[index + 3] = pixel.alpha;
    }
  }
  return { width, height, data };
}

function isInnerCenter(x: number, y: number): boolean {
  const normalizedX = x / (SIDE - 1);
  const normalizedY = y / (SIDE - 1);
  return normalizedX > 0.24
    && normalizedX < 0.76
    && normalizedY > 0.24
    && normalizedY < 0.76;
}

