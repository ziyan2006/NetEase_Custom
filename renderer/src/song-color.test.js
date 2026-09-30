import test from "node:test";
import assert from "node:assert/strict";
import { paletteFromPixels, songPaletteAmbientLight, songPaletteNeutralWhiteWeight, songPaletteUsesDarkSurface } from "./song-color.js";

const pixels = (...colors) => Uint8ClampedArray.from(colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
const colorDistance = (left, right) => Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));

test("song cover palette keeps the dominant and secondary cover colors with their area shares", () => {
  const cover = pixels(...Array(72).fill([35, 91, 218]), ...Array(24).fill([232, 112, 43]));
  const palette = paletteFromPixels(cover);
  assert.ok(palette);
  assert.ok(colorDistance(palette.primary, [35, 91, 218]) < 8);
  assert.ok(colorDistance(palette.secondary, [232, 112, 43]) < 8);
  assert.ok(Math.abs(palette.primaryShare - .75) < .02);
  assert.ok(Math.abs(palette.secondaryShare - .25) < .02);
});

test("song cover palette includes neutral artwork instead of discarding its dominant area", () => {
  const cover = pixels(...Array(72).fill([224, 220, 211]), ...Array(24).fill([181, 87, 48]));
  const palette = paletteFromPixels(cover);
  assert.ok(palette);
  assert.ok(colorDistance(palette.primary, [224, 220, 211]) < 8);
  assert.ok(colorDistance(palette.secondary, [181, 87, 48]) < 8);
  assert.ok(Math.abs(palette.primaryShare - .75) < .02);
});

test("single-color and transparent covers have stable palette fallbacks", () => {
  const single = paletteFromPixels(pixels(...Array(8).fill([210, 63, 48])));
  assert.deepEqual(single, {
    primary: [210, 63, 48],
    secondary: [210, 63, 48],
    primaryShare: 1,
    secondaryShare: 0,
  });
  assert.equal(paletteFromPixels(pixels([20, 20, 20, 0], [40, 40, 40, 0])), null);
});

test("dark neutral artwork keeps its darkness and exposes a substantial colored accent", () => {
  const cover = pixels(
    ...Array(63).fill([116, 115, 120]),
    ...Array(17).fill([9, 11, 15]),
    ...Array(13).fill([66, 104, 151]),
    ...Array(7).fill([207, 93, 113]),
  );
  const palette = paletteFromPixels(cover);
  assert.ok(palette);
  assert.ok(colorDistance(palette.primary, [116, 115, 120]) < 8);
  assert.ok(colorDistance(palette.secondary, [66, 104, 151]) < 8);
  assert.ok(Math.abs(palette.secondaryShare - .13) < .02);
  assert.equal(songPaletteUsesDarkSurface(palette), true);
});

test("cover lightness selects a full dark scene only for dark-led artwork", () => {
  assert.equal(songPaletteUsesDarkSurface({ primary: [22, 20, 23], secondary: [181, 42, 55], primaryShare: .78, secondaryShare: .22 }), true);
  assert.equal(songPaletteUsesDarkSurface({ primary: [229, 224, 214], secondary: [154, 75, 34], primaryShare: .77, secondaryShare: .23 }), false);
});

test("near-white dominant artwork removes ivory warmth without flattening colorful covers", () => {
  assert.ok(songPaletteNeutralWhiteWeight({ primary: [247, 246, 244], secondary: [70, 125, 176], primaryShare: .78, secondaryShare: .22 }) > .9);
  assert.ok(songPaletteNeutralWhiteWeight({ primary: [226, 220, 207], secondary: [165, 75, 40], primaryShare: .76, secondaryShare: .24 }) > .5);
  assert.equal(songPaletteNeutralWhiteWeight({ primary: [35, 91, 218], secondary: [232, 112, 43], primaryShare: .75, secondaryShare: .25 }), 0);
  assert.equal(songPaletteNeutralWhiteWeight({ primary: [22, 20, 23], secondary: [181, 42, 55], primaryShare: .78, secondaryShare: .22 }), 0);
});

test("neutral secondary pigments do not create a gray ambient veil", () => {
  for (const secondary of [[0, 0, 0], [115, 116, 117], [228, 233, 233], [255, 255, 255]]) {
    const light = songPaletteAmbientLight({ primary: [0, 200, 218], secondary, primaryShare: .7, secondaryShare: .3 });
    assert.equal(light.strength, 0);
    assert.ok(light.rgb.every(value => Number.isFinite(value) && value >= 0 && value <= 255));
  }
});

test("colored ambient light preserves its hue and scales with represented cover area", () => {
  const palette = { primary: [22, 20, 23], secondary: [180, 30, 50], primaryShare: .78, secondaryShare: .22 };
  const light = songPaletteAmbientLight(palette);
  assert.equal(Math.max(...light.rgb), 255);
  assert.ok(light.rgb[0] > light.rgb[2] && light.rgb[2] > light.rgb[1]);
  assert.ok(light.strength > .25 && light.strength < .5);
  assert.ok(songPaletteAmbientLight({ ...palette, secondaryShare: .04 }).strength < light.strength);
  assert.equal(songPaletteAmbientLight({ ...palette, secondaryShare: 0 }).strength, 0);
});

test("blue-led artwork produces a blue key light even with a white secondary region", () => {
  const light = songPaletteAmbientLight({ primary: [14, 122, 199], secondary: [231, 232, 234], primaryShare: .57, secondaryShare: .43 });
  assert.ok(light.keyStrength > .5);
  assert.equal(light.strength, 0);
  assert.equal(light.keyRgb[2], 255);
  assert.ok(light.keyRgb[0] < 60 && light.keyRgb[1] > 140);
  const neutral = songPaletteAmbientLight({ primary: [240, 242, 244], secondary: [150, 150, 150], primaryShare: .7, secondaryShare: .3 });
  assert.equal(neutral.keyStrength, 0);
  assert.equal(neutral.strength, 0);
});
