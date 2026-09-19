/** 取色与背景合成共用的固定参数。 */
export const AMBIENT_PARAMETERS = {
  samplingMaxEdge: 152,
  backdropMaxEdge: 256,
  minimumAlpha: 190,
  saturation: 1.8,
  blurRadii: [17, 17, 18] as const,
  semanticBaseColor: '#5E6F63',
  semanticBaseRgb: 0x5e6f63,
  fallbackRgb: 0x161b1e,
  meshAlpha: 0.55,
  backdropAlpha: 0.92,
  hueShifts: [-22, 28, 52, -58] as const,
} as const;

