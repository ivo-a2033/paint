const IMAGE_PROCESSING_SCALE = 2;
const CONTOUR_THICKNESS_PASSES = 2;
const BRUSH_SIZE = 18;
const EDGE_THRESHOLD = 100;
const CHARGE_DURATION = 1500;

function hsvToHex(h, s, v) {
  const chroma = v * s;
  const sector = h * 6;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = v - chroma;
  const channels = sector < 1 ? [chroma, secondary, 0]
    : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary]
        : sector < 4 ? [0, secondary, chroma]
          : sector < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return `#${channels.map((channel) => Math.round((channel + offset) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
}

const paints = Array.from({ length: 64 }, (_, index) => {
  const column = index % 8;
  const row = Math.floor(index / 8);
  const hex = hsvToHex(column / 8, 1, 0.2 + (row / 7) * 0.8);
  return { hex };
});

function colorValue(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function mixHex(baseHex, addedHex, amount) {
  const base = Number.parseInt(baseHex.slice(1), 16);
  const added = Number.parseInt(addedHex.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => {
    const baseChannel = (base >> shift) & 255;
    const addedChannel = (added >> shift) & 255;
    return Math.round(baseChannel * (1 - amount) + addedChannel * amount);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

class PaintScene extends Phaser.Scene {
  constructor() {
    super({ key: 'paint' });
  }

  loadPhoto(file) {
        window.setImageDebugStage('decode');
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          try {
            this.processPhoto(image);
          } catch (error) {
            window.setImageError(error);
          }
        };
        image.onerror = (event) => {
          URL.revokeObjectURL(objectUrl);
          console.error('Uploaded image decode failed.', {
            event,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
          window.setImageError(new Error(
            `Browser could not decode ${file.name} (${file.type || 'unknown type'}, ${file.size} bytes).`,
          ));
        };
        image.src = objectUrl;
  }

  processPhoto(image) {
        const { x, y, width, height } = this.photoFrame;
      const fitScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const displayWidth = Math.max(1, Math.round(image.naturalWidth * fitScale));
      const displayHeight = Math.max(1, Math.round(image.naturalHeight * fitScale));
      const imageWidth = Math.max(1, Math.round(displayWidth * IMAGE_PROCESSING_SCALE));
      const imageHeight = Math.max(1, Math.round(displayHeight * IMAGE_PROCESSING_SCALE));
        window.setImageDebugStage('resize');
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = imageWidth;
        sourceCanvas.height = imageHeight;
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
        sourceContext.drawImage(image, 0, 0, imageWidth, imageHeight);

        window.setImageDebugStage('pixels');
        const sourcePixels = sourceContext.getImageData(0, 0, imageWidth, imageHeight).data;
        const pixelCount = imageWidth * imageHeight;
        const grayscale = new Uint8Array(pixelCount);
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = imageWidth;
        outputCanvas.height = imageHeight;

        window.setImageDebugStage('grayscale');
        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
          const offset = pixel * 4;
          grayscale[pixel] = Math.round(
            sourcePixels[offset] * 0.299
            + sourcePixels[offset + 1] * 0.587
            + sourcePixels[offset + 2] * 0.114,
          );
        }

        window.setImageDebugStage('edges');
        const edgeMask = new Uint8Array(pixelCount);
        const thresholdSquared = EDGE_THRESHOLD * EDGE_THRESHOLD;
        for (let y = 1; y < imageHeight - 1; y += 1) {
          for (let x = 1; x < imageWidth - 1; x += 1) {
            const topLeft = (y - 1) * imageWidth + x - 1;
            const middleLeft = y * imageWidth + x - 1;
            const bottomLeft = (y + 1) * imageWidth + x - 1;
            const gradientX = -grayscale[topLeft] + grayscale[topLeft + 2]
              - 2 * grayscale[middleLeft] + 2 * grayscale[middleLeft + 2]
              - grayscale[bottomLeft] + grayscale[bottomLeft + 2];
            const gradientY = -grayscale[topLeft] - 2 * grayscale[topLeft + 1]
              - grayscale[topLeft + 2] + grayscale[bottomLeft]
              + 2 * grayscale[bottomLeft + 1] + grayscale[bottomLeft + 2];
            if (gradientX * gradientX + gradientY * gradientY > thresholdSquared) {
              edgeMask[y * imageWidth + x] = 255;
            }
          }
        }

        window.setImageDebugStage('thicken');
        let lineMask = edgeMask;
        for (let pass = 0; pass < CONTOUR_THICKNESS_PASSES; pass += 1) {
          const expanded = new Uint8Array(pixelCount);
          for (let y = 0; y < imageHeight; y += 1) {
            for (let x = 0; x < imageWidth; x += 1) {
              if (!lineMask[y * imageWidth + x]) continue;
              for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                const targetY = y + offsetY;
                if (targetY < 0 || targetY >= imageHeight) continue;
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                  const targetX = x + offsetX;
                  if (targetX >= 0 && targetX < imageWidth) {
                    expanded[targetY * imageWidth + targetX] = 255;
                  }
                }
              }
            }
          }
          lineMask = expanded;
        }

        window.setImageDebugStage('lineart');
        const outputContext = outputCanvas.getContext('2d');
        const lineArt = outputContext.createImageData(imageWidth, imageHeight);
        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
          lineArt.data[pixel * 4 + 3] = lineMask[pixel];
        }
        outputContext.putImageData(lineArt, 0, 0);

        window.setImageDebugStage('texture');
        if (this.lineArtImage) this.lineArtImage.destroy();
        if (this.textures.exists('uploaded-lineart')) this.textures.remove('uploaded-lineart');
        this.textures.addCanvas('uploaded-lineart', outputCanvas);
        this.lineArtImage = this.add.image(x + width / 2, y + height / 2, 'uploaded-lineart')
          .setDisplaySize(displayWidth, displayHeight)
          .setDepth(3);
        this.photoBounds = {
          x: x + (width - displayWidth) / 2,
          y: y + (height - displayHeight) / 2,
          width: displayWidth,
          height: displayHeight,
        };
        this.photoPrompt.setVisible(false);
        this.paintLayer.clear();
        this.isPhotoLoaded = true;
        window.setImageReady();
  }

  create() {
      this.bucketColor = '#ffffff';
      this.isPainting = false;
      this.lastPaintPoint = null;
      this.selectedPaint = null;
      this.charge = 0;
      this.chargeStart = 0;
      this.isCharging = false;
      this.chargePosition = { x: 0, y: 0 };

      const swatches = paints.map((paint, index) => {
        const column = index % 8;
        const row = Math.floor(index / 8);
        const x = 25 + column * 41;
        const y = 65 + row * 64;
        return this.add.rectangle(x + 17, y + 25, 34, 50, colorValue(paint.hex))
          .setStrokeStyle(1, 0x34342f)
          .setInteractive({ useHandCursor: true })
          .setData('paint', paint);
      });

      this.bucketShape = this.add.circle(412, 125, 48, 0xffffff)
        .setStrokeStyle(3, 0x34342f)
        .setInteractive({ useHandCursor: true });
      this.add.text(412, 185, 'BUCKET', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#252525',
      }).setOrigin(0.5);
      this.add.text(25, 28, 'HOLD A COLOR, TAP BUCKET, THEN PAINT', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#454545',
      });

      this.photoFrame = { x: 500, y: 65, width: 590, height: 610 };
      this.photoBounds = this.photoFrame;
      this.add.rectangle(
        this.photoFrame.x + this.photoFrame.width / 2,
        this.photoFrame.y + this.photoFrame.height / 2,
        this.photoFrame.width,
        this.photoFrame.height,
        0xffffff,
      ).setStrokeStyle(1, 0xb9b3a7);

      this.photoPrompt = this.add.text(795, 365, 'Choose a photo to begin', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#777168',
      }).setOrigin(0.5);

      this.paintLayer = this.add.graphics().setDepth(2);
      this.chargeIndicator = this.add.graphics().setDepth(10);
      this.drawChargeIndicator = () => {
        const indicator = this.chargeIndicator;
        indicator.clear();
        if (!this.selectedPaint) return;

        const { x, y } = this.chargePosition;
        indicator.fillStyle(colorValue(this.selectedPaint.hex), 0.65);
        indicator.fillCircle(x, y, 5 + this.charge * 8);
        indicator.lineStyle(2, 0x34342f, 0.5);
        indicator.strokeCircle(x, y, 17);
        if (this.charge > 0) {
          indicator.lineStyle(3, colorValue(this.selectedPaint.hex), 1);
          indicator.beginPath();
          indicator.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + this.charge * Math.PI * 2);
          indicator.strokePath();
        }
      };
      this.lineArtImage = null;
      this.isPhotoLoaded = false;

      swatches.forEach((swatch) => {
        swatch.on('pointerdown', (pointer) => {
          this.selectedPaint = swatch.getData('paint');
          this.charge = 0;
          this.chargeStart = this.time.now;
          this.isCharging = true;
          this.chargePosition = { x: pointer.x, y: pointer.y };
          swatches.forEach((item) => item.setStrokeStyle(1, 0x34342f));
          swatch.setStrokeStyle(3, 0xffffff);
          this.drawChargeIndicator();
        });
      });

      this.bucketShape.on('pointerdown', () => {
        if (!this.selectedPaint || this.charge <= 0) return;
        this.bucketColor = mixHex(this.bucketColor, this.selectedPaint.hex, this.charge);
        this.bucketShape.setFillStyle(colorValue(this.bucketColor));
      });

      this.paintAt = (x, y) => {
        const { x: left, y: top, width, height } = this.photoBounds;
        const radius = BRUSH_SIZE / 2;
        const point = {
          x: Phaser.Math.Clamp(x, left + radius, left + width - radius),
          y: Phaser.Math.Clamp(y, top + radius, top + height - radius),
        };
        this.paintLayer.lineStyle(BRUSH_SIZE, colorValue(this.bucketColor), 1);
        this.paintLayer.beginPath();
        if (this.lastPaintPoint) {
          this.paintLayer.moveTo(this.lastPaintPoint.x, this.lastPaintPoint.y);
          this.paintLayer.lineTo(point.x, point.y);
        } else {
          this.paintLayer.moveTo(point.x, point.y);
          this.paintLayer.lineTo(point.x + 0.01, point.y + 0.01);
        }
        this.paintLayer.strokePath();
        this.lastPaintPoint = point;
      };

      this.input.on('pointerdown', (pointer) => {
        const { x, y, width, height } = this.photoBounds;
        if (!this.isPhotoLoaded || x > pointer.x || pointer.x > x + width
          || y > pointer.y || pointer.y > y + height) return;
        window.setImageDebugStage('paint');
        this.isPainting = true;
        this.lastPaintPoint = null;
        this.paintAt(pointer.x, pointer.y);
      });
      this.input.on('pointermove', (pointer) => {
        if (this.isCharging) {
          this.charge = Math.min(1, (this.time.now - this.chargeStart) / CHARGE_DURATION);
          this.chargePosition = { x: pointer.x, y: pointer.y };
          this.drawChargeIndicator();
        }
        if (this.isPainting && pointer.isDown) this.paintAt(pointer.x, pointer.y);
      });
      this.input.on('pointerup', () => {
        if (this.isCharging) {
          this.charge = Math.min(1, (this.time.now - this.chargeStart) / CHARGE_DURATION);
          this.isCharging = false;
          this.drawChargeIndicator();
        }
        this.isPainting = false;
        this.lastPaintPoint = null;
      });
      window.paintScene = this;
  }

  update() {
    if (!this.isCharging) return;
    this.charge = Math.min(1, (this.time.now - this.chargeStart) / CHARGE_DURATION);
    this.drawChargeIndicator();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1120,
  height: 720,
  backgroundColor: '#f3f0e8',
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: PaintScene,
});