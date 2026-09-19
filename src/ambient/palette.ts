import { AMBIENT_PARAMETERS } from './constants';
import {
  clamp,
  hslToRgb,
  luminance,
  packRgb,
  rgbToHex,
  rgbToHsl,
} from './colorMath';
import type { AmbientAnalysis, MeshColors, PixelBuffer } from './types';

export interface NumericAmbientAnalysis {
  readonly dominantRgb: number;
  readonly meshRgbs: readonly [number, number, number, number];
  readonly averageLuminance: number;
  readonly scrimAlpha: number;
}

interface RegionDefinition {
  readonly weight: number;
  readonly contains: (normalizedX: number, normalizedY: number) => boolean;
}

interface Bucket {
  weight: number;
  red: number;
  green: number;
  blue: number;
}

const BAND_RATIO = 0.35;
const CENTER_INSET_RATIO = 0.24;

/** 顺序同时决定同权重时的稳定优先级。 */
const REGIONS: readonly RegionDefinition[] = [
  { weight: 0.78, contains: (_x, y) => y < BAND_RATIO },
  { weight: 1.02, contains: (_x, y) => y > 1 - BAND_RATIO },
  { weight: 0.86, contains: (x) => x < BAND_RATIO },
  { weight: 0.86, contains: (x) => x > 1 - BAND_RATIO },
  {
    weight: 1.18,
    contains: (x, y) => (
      x > CENTER_INSET_RATIO
      && x < 1 - CENTER_INSET_RATIO
      && y > CENTER_INSET_RATIO
      && y < 1 - CENTER_INSET_RATIO
    ),
  },
  { weight: 0.92, contains: () => true },
];

export function extractAmbientPalette(buffer: PixelBuffer): AmbientAnalysis {
  return toAmbientAnalysis(extractNumericPalette(buffer));
}

export function extractNumericPalette(buffer: PixelBuffer): NumericAmbientAnalysis {
  if (!isValidBuffer(buffer)) {
    return fallbackAnalysis();
  }

  const side = Math.min(buffer.width, buffer.height);
  const originX = Math.floor((buffer.width - side) / 2);
  const originY = Math.floor((buffer.height - side) / 2);
  const step = Math.max(3, Math.floor(side / 46));
  const regionBuckets = REGIONS.map(() => new Map<string, Bucket>());

  let sampleCount = 0;
  let luminanceSum = luminance(AMBIENT_PARAMETERS.fallbackRgb);
  let luminanceCount = 1;

  for (let y = 0; y < side; y += step) {
    for (let x = 0; x < side; x += step) {
      const pixelIndex = ((originY + y) * buffer.width + originX + x) * 4;
      const alpha = buffer.data[pixelIndex + 3] ?? 0;
      if (alpha < AMBIENT_PARAMETERS.minimumAlpha) {
        continue;
      }

      const red = buffer.data[pixelIndex] ?? 0;
      const green = buffer.data[pixelIndex + 1] ?? 0;
      const blue = buffer.data[pixelIndex + 2] ?? 0;
      const rgb = packRgb(red, green, blue);
      const hsl = rgbToHsl(rgb);
      const normalizedX = side <= 1 ? 0.5 : x / (side - 1);
      const normalizedY = side <= 1 ? 0.5 : y / (side - 1);
      const weight = sampleWeight(
        hsl.hue,
        hsl.saturation,
        hsl.lightness,
        normalizedX,
        normalizedY,
      );
      const bucketKey = [
        Math.round(hsl.hue / 18),
        Math.round(hsl.saturation / 0.16),
        Math.round(hsl.lightness / 0.12),
      ].join(':');

      for (let regionIndex = 0; regionIndex < REGIONS.length; regionIndex += 1) {
        const region = REGIONS[regionIndex];
        if (!region?.contains(normalizedX, normalizedY)) {
          continue;
        }
        const table = regionBuckets[regionIndex];
        if (!table) continue;
        const bucket = table.get(bucketKey) ?? {
          weight: 0,
          red: 0,
          green: 0,
          blue: 0,
        };
        bucket.weight += weight;
        bucket.red += red * weight;
        bucket.green += green * weight;
        bucket.blue += blue * weight;
        table.set(bucketKey, bucket);
      }

      sampleCount += 1;
      luminanceSum += luminance(rgb);
      luminanceCount += 1;
    }
  }

  if (sampleCount === 0) {
    return fallbackAnalysis();
  }

  const dominantRgb = pickDominant(regionBuckets);
  const averageLuminance = luminanceSum / luminanceCount;
  return {
    dominantRgb,
    meshRgbs: deriveMeshColors(dominantRgb),
    averageLuminance,
    scrimAlpha: scrimAlphaFor(averageLuminance),
  };
}

export function sampleWeight(
  _hue: number,
  saturation: number,
  lightness: number,
  normalizedX: number,
  normalizedY: number,
): number {
  const deltaX = normalizedX - 0.5;
  const deltaY = normalizedY - 0.52;
  const centerBias = 1.15 - Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), 0.55);
  const saturationWeight = 0.48 + saturation * 1.15;
  const lightnessWeight = 0.55 + (
    1 - Math.min(1, Math.abs(lightness - 0.47) / 0.42)
  );
  return Math.max(0, centerBias) * saturationWeight * lightnessWeight;
}

export function deriveMeshColors(
  dominantRgb: number,
): readonly [number, number, number, number] {
  const hsl = rgbToHsl(dominantRgb);
  const colors = AMBIENT_PARAMETERS.hueShifts.map((shift) => hslToRgb(
    hsl.hue + shift,
    hsl.saturation,
    hsl.lightness,
  ));
  return [colors[0], colors[1], colors[2], colors[3]];
}

export function scrimAlphaFor(averageLuminance: number): number {
  return Math.round(clamp(0x34 + averageLuminance * 0x58, 0x36, 0x78));
}

function pickDominant(regionBuckets: readonly Map<string, Bucket>[]): number {
  let dominantRgb: number = AMBIENT_PARAMETERS.fallbackRgb;
  let bestRegionWeight = Number.NEGATIVE_INFINITY;
  let bestBucketWeight = Number.NEGATIVE_INFINITY;

  REGIONS.forEach((region, index) => {
    let winner: Bucket | undefined;
    regionBuckets[index]?.forEach((bucket) => {
      if (!winner || bucket.weight > winner.weight) {
        winner = bucket;
      }
    });
    if (!winner || winner.weight <= 0) {
      return;
    }
    const wins = region.weight > bestRegionWeight
      || (region.weight === bestRegionWeight && winner.weight > bestBucketWeight);
    if (!wins) {
      return;
    }
    bestRegionWeight = region.weight;
    bestBucketWeight = winner.weight;
    dominantRgb = packRgb(
      winner.red / winner.weight,
      winner.green / winner.weight,
      winner.blue / winner.weight,
    );
  });

  return dominantRgb;
}

function fallbackAnalysis(): NumericAmbientAnalysis {
  const dominantRgb = AMBIENT_PARAMETERS.fallbackRgb;
  const averageLuminance = luminance(dominantRgb);
  return {
    dominantRgb,
    meshRgbs: deriveMeshColors(dominantRgb),
    averageLuminance,
    scrimAlpha: scrimAlphaFor(averageLuminance),
  };
}

export function toAmbientAnalysis(result: NumericAmbientAnalysis): AmbientAnalysis {
  const meshColors = result.meshRgbs.map(rgbToHex) as unknown as MeshColors;
  return {
    dominantColor: rgbToHex(result.dominantRgb),
    meshColors,
    averageLuminance: result.averageLuminance,
    scrimAlpha: result.scrimAlpha,
  };
}

function isValidBuffer(buffer: PixelBuffer): boolean {
  return buffer.width > 0
    && buffer.height > 0
    && buffer.data.length >= buffer.width * buffer.height * 4;
}
