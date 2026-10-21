export type CropView = {
  zoom: number;
  rotation: number;
  x: number;
  y: number;
  flipX?: boolean;
  flipY?: boolean;
  circle?: boolean;
};
export const initialCrop: CropView = { zoom: 1, rotation: 0, x: 0, y: 0 };

export function cropTransform(
  width: number,
  height: number,
  view: CropView,
  size = 320,
  targetHeight = size,
) {
  const angle = (view.rotation * Math.PI) / 180;
  const snap = (n: number) =>
    Math.abs(n) < 1e-10
      ? 0
      : Math.abs(n - 1) < 1e-10
        ? 1
        : Math.abs(n + 1) < 1e-10
          ? -1
          : n;
  const cos = snap(Math.cos(angle));
  const sin = snap(Math.sin(angle));
  // Project the viewport into the image's own axes, then clamp movement there.
  const projectedWidth = Math.abs(cos) * size + Math.abs(sin) * targetHeight;
  const projectedHeight = Math.abs(sin) * size + Math.abs(cos) * targetHeight;
  const scale =
    Math.max(projectedWidth / width, projectedHeight / height) *
    Math.max(1, view.zoom);
  const limitX = Math.max(0, (width * scale - projectedWidth) / 2);
  const limitY = Math.max(0, (height * scale - projectedHeight) / 2);
  const imageX = Math.max(
    -limitX,
    Math.min(limitX, cos * view.x + sin * view.y),
  );
  const imageY = Math.max(
    -limitY,
    Math.min(limitY, -sin * view.x + cos * view.y),
  );
  return {
    scale,
    x: snap(cos * imageX - sin * imageY) || 0,
    y: snap(sin * imageX + cos * imageY) || 0,
  };
}

export function drawAvatar(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  view: CropView,
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片裁剪");
  const transform = cropTransform(
    image.naturalWidth,
    image.naturalHeight,
    view,
    320,
    (320 * canvas.height) / canvas.width,
  );
  const ratio = canvas.width / 320;
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(
    canvas.width / 2 + transform.x * ratio,
    canvas.height / 2 + transform.y * ratio,
  );
  context.rotate((view.rotation * Math.PI) / 180);
  context.scale(
    transform.scale * ratio * (view.flipX ? -1 : 1),
    transform.scale * ratio * (view.flipY ? -1 : 1),
  );
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  if (view.circle) {
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.beginPath();
    context.arc(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) / 2,
      0,
      2 * Math.PI,
    );
    context.fill();
    context.restore();
  }
}
