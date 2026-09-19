export interface SharedCamera {
  originX: number;
  originY: number;
  scale: number;
}

export const camera: SharedCamera = {
  originX: 0,
  originY: 0,
  scale: 1.0,
};

const cos30: number = Math.cos(Math.PI / 6); // ~0.866025
const sin30: number = Math.sin(Math.PI / 6); // 0.5

export function worldToScreen(wx: number, wy: number, wz: number = 0): { x: number; y: number } {
  const isoX = (wx - wy) * cos30;
  const isoY = (wx + wy) * sin30 - wz;
  return {
    x: isoX * camera.scale + camera.originX,
    y: isoY * camera.scale + camera.originY,
  };
}

export function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  const normX = (sx - camera.originX) / camera.scale;
  const normY = (sy - camera.originY) / camera.scale;

  const u = normX / cos30;
  const v = normY / sin30;

  const wx = (u + v) / 2.0;
  const wy = (v - u) / 2.0;

  return { wx, wy };
}

export function fitCameraToBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  viewportWidth: number,
  viewportHeight: number,
  paddingPercent: number = 0.18
) {
  // Compute isometric bounding box corners at z = 0
  const c1 = { x: (minX - minY) * cos30, y: (minX + minY) * sin30 };
  const c2 = { x: (maxX - minY) * cos30, y: (maxX + minY) * sin30 };
  const c3 = { x: (minX - maxY) * cos30, y: (minX + maxY) * sin30 };
  const c4 = { x: (maxX - maxY) * cos30, y: (maxX + maxY) * sin30 };

  const isoMinX = Math.min(c1.x, c2.x, c3.x, c4.x);
  const isoMaxX = Math.max(c1.x, c2.x, c3.x, c4.x);
  const isoMinY = Math.min(c1.y, c2.y, c3.y, c4.y);
  const isoMaxY = Math.max(c1.y, c2.y, c3.y, c4.y);

  const isoW = isoMaxX - isoMinX;
  const isoH = isoMaxY - isoMinY;

  const padX = viewportWidth * paddingPercent;
  const padY = viewportHeight * paddingPercent;

  const scaleX = (viewportWidth - padX * 2) / isoW;
  const scaleY = (viewportHeight - padY * 2) / isoH;

  camera.scale = Math.max(0.5, Math.min(scaleX, scaleY, 2.5));

  const centerIsoX = (isoMinX + isoMaxX) / 2.0;
  const centerIsoY = (isoMinY + isoMaxY) / 2.0;

  camera.originX = viewportWidth / 2.0 - centerIsoX * camera.scale;
  camera.originY = viewportHeight / 2.0 - centerIsoY * camera.scale;
}
