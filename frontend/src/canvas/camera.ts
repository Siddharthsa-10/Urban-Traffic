export class IsometricCamera {
  public offsetX: number = 0;
  public offsetY: number = 0;
  public scale: number = 1.0;

  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;

  // Isometric 30 degree constants
  private readonly cos30: number = Math.cos(Math.PI / 6); // ~0.866025
  private readonly sin30: number = Math.sin(Math.PI / 6); // 0.5

  constructor(private canvas: HTMLCanvasElement) {
    this.setupListeners();
  }

  public project(wx: number, wy: number, wz: number = 0): { x: number; y: number } {
    const isoX = (wx - wy) * this.cos30;
    const isoY = (wx + wy) * this.sin30 - wz;
    return {
      x: isoX * this.scale + this.offsetX,
      y: isoY * this.scale + this.offsetY,
    };
  }

  public unproject(sx: number, sy: number): { wx: number; wy: number } {
    // Inverse isometric projection to z=0 ground plane
    const normX = (sx - this.offsetX) / this.scale;
    const normY = (sy - this.offsetY) / this.scale;

    // normX = (wx - wy) * cos30  =>  (wx - wy) = normX / cos30
    // normY = (wx + wy) * sin30  =>  (wx + wy) = normY / sin30
    const u = normX / this.cos30;
    const v = normY / this.sin30;

    const wx = (u + v) / 2.0;
    const wy = (v - u) / 2.0;

    return { wx, wy };
  }

  public fitBounds(minX: number, minY: number, maxX: number, maxY: number, width: number, height: number) {
    // Project all 4 corners
    const c1 = { x: (minX - minY) * this.cos30, y: (minX + minY) * this.sin30 };
    const c2 = { x: (maxX - minY) * this.cos30, y: (maxX + minY) * this.sin30 };
    const c3 = { x: (minX - maxY) * this.cos30, y: (minX + maxY) * this.sin30 };
    const c4 = { x: (maxX - maxY) * this.cos30, y: (maxX + maxY) * this.sin30 };

    const isoMinX = Math.min(c1.x, c2.x, c3.x, c4.x);
    const isoMaxX = Math.max(c1.x, c2.x, c3.x, c4.x);
    const isoMinY = Math.min(c1.y, c2.y, c3.y, c4.y);
    const isoMaxY = Math.max(c1.y, c2.y, c3.y, c4.y);

    const netWidth = isoMaxX - isoMinX;
    const netHeight = isoMaxY - isoMinY;

    const padding = 80;
    const scaleX = (width - padding * 2) / netWidth;
    const scaleY = (height - padding * 2) / netHeight;

    this.scale = Math.max(0.6, Math.min(scaleX, scaleY, 1.8));

    const centerIsoX = (isoMinX + isoMaxX) / 2.0;
    const centerIsoY = (isoMinY + isoMaxY) / 2.0;

    this.offsetX = width / 2.0 - centerIsoX * this.scale;
    this.offsetY = height / 2.0 - centerIsoY * this.scale;
  }

  private setupListeners() {
    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - this.offsetX;
      this.dragStartY = e.clientY - this.offsetY;
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;
      }
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const newScale = Math.max(0.4, Math.min(3.0, this.scale * zoomFactor));
      this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
      this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
    });
  }
}
