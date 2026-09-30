const labFromRgb = (red, green, blue) => {
  const linearize = value => {
    value /= 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  const r = linearize(red), g = linearize(green), b = linearize(blue);
  const x = (r * .4124564 + g * .3575761 + b * .1804375) / .95047;
  const y = (r * .2126729 + g * .7151522 + b * .072175) / 1;
  const z = (r * .0193339 + g * .119192 + b * .9503041) / 1.08883;
  const pivot = value => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = pivot(x), fy = pivot(y), fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const distanceSquared = (left, right) => left.reduce((total, value, index) => total + (value - right[index]) ** 2, 0);

/** A cover led by dark colors should use the same scene lighting as dark mode. */
export function songPaletteUsesDarkSurface(palette) {
  const primaryLightness = labFromRgb(...palette.primary)[0];
  const secondaryLightness = labFromRgb(...palette.secondary)[0];
  const totalShare = palette.primaryShare + palette.secondaryShare || 1;
  const weightedLightness = (primaryLightness * palette.primaryShare + secondaryLightness * palette.secondaryShare) / totalShare;
  return primaryLightness < 48 || weightedLightness < 51;
}

/** Neutralize the ivory scene only when a large, near-white cover region leads. */
export function songPaletteNeutralWhiteWeight(palette) {
  const [lightness, a, b] = labFromRgb(...palette.primary);
  const clamp = value => Math.max(0, Math.min(1, value));
  return clamp((lightness - 72) / 18)
    * clamp((24 - Math.hypot(a, b)) / 18)
    * clamp((palette.primaryShare - .35) / .3);
}

const lightFromPigment = (color, area) => {
  const peak = Math.max(...color);
  const saturation = peak ? (peak - Math.min(...color)) / peak : 0;
  const chroma = Math.max(0, Math.min(1, (saturation - .12) / .55));
  const share = Math.max(0, Math.min(1, area));
  return {
    // Lift the value while preserving the hue, as an illuminated diffuser would.
    rgb: color.map(value => Math.round(255 * (.14 + .86 * (peak ? value / peak : 1)))),
    strength: chroma * Math.sqrt(share) * .8,
  };
};

/** Both cover hues illuminate geometry; neutral pigment produces no colored lamp. */
export function songPaletteAmbientLight(palette) {
  const key = lightFromPigment(palette.primary, palette.primaryShare);
  const fill = lightFromPigment(palette.secondary, Math.min(.5, palette.secondaryShare));
  return { ...fill, keyRgb: key.rgb, keyStrength: key.strength };
}

/** Extract the two largest perceptual color groups and their pixel shares. */
export function paletteFromPixels(pixels) {
  if (!pixels || pixels.length < 4) return null;
  const buckets = new Map();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    total++;
  }
  if (!total) return null;

  const colors = [...buckets.values()].map(bucket => {
    const rgb = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count];
    return { ...bucket, rgb, lab: labFromRgb(...rgb) };
  });
  const first = colors.reduce((largest, color) => color.count > largest.count ? color : largest);
  if (colors.length === 1) {
    const color = first.rgb.map(Math.round);
    return { primary: color, secondary: [...color], primaryShare: 1, secondaryShare: 0 };
  }

  // Seed the second center from a color that is both represented and distinct;
  // a lone bright speck should not outweigh a large secondary region.
  const second = colors
    .filter(color => color !== first)
    .reduce((best, color) => {
      const score = color.count * Math.sqrt(distanceSquared(first.lab, color.lab));
      return score > best.score ? { color, score } : best;
    }, { color: colors.find(color => color !== first), score: -1 }).color;
  let centers = [first.lab, second.lab];
  let groups = [];
  for (let iteration = 0; iteration < 10; iteration++) {
    groups = [
      { count: 0, r: 0, g: 0, b: 0, lab: [0, 0, 0] },
      { count: 0, r: 0, g: 0, b: 0, lab: [0, 0, 0] },
    ];
    for (const color of colors) {
      const index = distanceSquared(color.lab, centers[0]) <= distanceSquared(color.lab, centers[1]) ? 0 : 1;
      const group = groups[index];
      group.count += color.count;
      group.r += color.r;
      group.g += color.g;
      group.b += color.b;
      for (let axis = 0; axis < 3; axis++) group.lab[axis] += color.lab[axis] * color.count;
    }
    for (let index = 0; index < 2; index++) {
      const group = groups[index];
      if (!group.count) continue;
      centers[index] = group.lab.map(value => value / group.count);
    }
  }

  // Order by actual coverage so the larger color always drives the atmosphere.
  if (groups[1].count > groups[0].count) groups.reverse();
  const colorFor = group => group.count
    ? [group.r, group.g, group.b].map(value => Math.round(value / group.count))
    : first.rgb.map(Math.round);
  const primaryShare = groups[0].count / total;
  let secondary = colorFor(groups[1]);
  let secondaryShare = groups[1].count / total;

  // A neutral dark cover may contain a clear colored region that two-means
  // absorbs into gray/black. Keep neutral coverage for the scene brightness,
  // then use a represented cover hue for the visible atmospheric accent.
  const primaryLab = labFromRgb(...colorFor(groups[0]));
  const secondaryLab = labFromRgb(...secondary);
  if (Math.hypot(primaryLab[1], primaryLab[2]) < 18 && Math.hypot(secondaryLab[1], secondaryLab[2]) < 18) {
    const hueGroups = Array.from({ length: 8 }, () => ({ count: 0, r: 0, g: 0, b: 0 }));
    for (const color of colors) {
      if (Math.hypot(color.lab[1], color.lab[2]) < 18 || Math.max(...color.rgb) - Math.min(...color.rgb) < 32) continue;
      const hue = (Math.atan2(color.lab[2], color.lab[1]) + Math.PI * 2) % (Math.PI * 2);
      const group = hueGroups[Math.floor(hue / (Math.PI / 4))];
      group.count += color.count;
      group.r += color.r;
      group.g += color.g;
      group.b += color.b;
    }
    const accent = hueGroups.reduce((largest, group) => group.count > largest.count ? group : largest);
    if (accent.count / total >= .035) {
      secondary = [accent.r, accent.g, accent.b].map(value => Math.round(value / accent.count));
      secondaryShare = accent.count / total;
    }
  }
  return {
    primary: colorFor(groups[0]),
    secondary,
    primaryShare,
    secondaryShare,
  };
}

/** Load a cover without cross-origin readback permission or canvas taint. */
export function readSongCoverPalette(url) {
  if (typeof url !== "string" || !url) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 48;
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, 48, 48);
        resolve(paletteFromPixels(context.getImageData(0, 0, 48, 48).data));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
