import assert from "node:assert/strict";
import test from "node:test";
import { cropTransform, initialCrop } from "../src/lib/avatar-crop.ts";

test("45-degree banner rotations and pan keep every viewport corner inside the image", () => {
  const targetHeight = (320 * 420) / 1080;
  for (const rotation of [-405, -45, 45, 135, 225, 315]) {
    for (const zoom of [1, 2, 4]) {
      const t = cropTransform(
        640,
        400,
        { ...initialCrop, rotation, zoom, x: 999, y: -999 },
        320,
        targetHeight,
      );
      const angle = (rotation * Math.PI) / 180;
      for (const x of [-160, 160])
        for (const y of [-targetHeight / 2, targetHeight / 2]) {
          const ix =
            (Math.cos(angle) * (x - t.x) + Math.sin(angle) * (y - t.y)) /
            t.scale;
          const iy =
            (-Math.sin(angle) * (x - t.x) + Math.cos(angle) * (y - t.y)) /
            t.scale;
          assert.ok(Math.abs(ix) <= 320 + 1e-9);
          assert.ok(Math.abs(iy) <= 200 + 1e-9);
        }
    }
  }
});

test("banner cropping covers its rectangular viewport across rotations without stretching", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const t = cropTransform(
      640,
      400,
      { ...initialCrop, rotation, x: 9999, y: -9999 },
      320,
      (320 * 420) / 1080,
    );
    const w = rotation % 180 ? 400 : 640;
    const h = rotation % 180 ? 640 : 400;
    assert.ok(w * t.scale >= 320);
    assert.ok(h * t.scale >= (320 * 420) / 1080);
    assert.ok(Math.abs(t.x) <= (w * t.scale - 320) / 2 + 1e-9);
    assert.ok(Math.abs(t.y) <= (h * t.scale - (320 * 420) / 1080) / 2 + 1e-9);
  }
});

test("portrait and landscape crops cover the square without stretching", () => {
  assert.deepEqual(cropTransform(640, 320, initialCrop), {
    scale: 1,
    x: 0,
    y: 0,
  });
  assert.deepEqual(cropTransform(320, 640, initialCrop), {
    scale: 1,
    x: 0,
    y: 0,
  });
});

test("panning is clamped so the crop cannot expose an empty edge", () => {
  assert.deepEqual(
    cropTransform(640, 320, { ...initialCrop, x: 999, y: -999 }),
    { scale: 1, x: 160, y: 0 },
  );
  assert.deepEqual(
    cropTransform(320, 640, { ...initialCrop, x: -999, y: 999 }),
    { scale: 1, x: 0, y: 160 },
  );
});

test("quarter turns swap the panning bounds and full turns restore them", () => {
  assert.deepEqual(
    cropTransform(640, 320, { ...initialCrop, rotation: -90, x: 999, y: -999 }),
    { scale: 1, x: 0, y: -160 },
  );
  assert.deepEqual(
    cropTransform(640, 320, { ...initialCrop, rotation: 360, x: 999, y: 999 }),
    { scale: 1, x: 160, y: 0 },
  );
});

test("zoom expands the movable image area and cannot shrink below cover", () => {
  assert.deepEqual(
    cropTransform(320, 320, { ...initialCrop, zoom: 2, x: 200, y: -200 }),
    { scale: 2, x: 160, y: -160 },
  );
  assert.equal(cropTransform(320, 320, { ...initialCrop, zoom: 0.5 }).scale, 1);
});
