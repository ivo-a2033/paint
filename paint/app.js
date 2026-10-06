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
  const row = Math.floor(index / 8);
  const hue = (index % 8 + Math.random()) / 8;
  const value = row < 4 ? 0.35 + Math.random() * 0.3 : 0.65 + Math.random() * 0.33;
  const hex = hsvToHex(hue, 1, value);
  return { hex, color: new spectral.Color(hex) };
});

for (let index = paints.length - 1; index > 0; index -= 1) {
  const swapIndex = Math.floor(Math.random() * (index + 1));
  [paints[index], paints[swapIndex]] = [paints[swapIndex], paints[index]];
}

function hexToHsv(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  return { h: hue, s: maximum ? delta / maximum : 0, v: maximum };
}

function colorValue(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

const targetHue = Math.random();
const targetPaint = new spectral.Color(hsvToHex(
  targetHue,
  0.82 + Math.random() * 0.18,
  0.82 + Math.random() * 0.18,
));

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1040,
  height: 600,
  backgroundColor: '#f3f0e8',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: {
    create() {
      this.charge = 0;
      this.chargeStart = 0;
      this.isCharging = false;
      this.selectedPaint = null;
      this.bucketMix = new spectral.Color('#ffffff');
      this.pointerPosition = { x: 0, y: 0 };

      const swatches = paints.map((paint, index) => {
        const column = index % 8;
        const row = Math.floor(index / 8);
        const x = 26 + column * 42;
        const y = 50 + row * 64;
        return this.add.rectangle(x + 18, y + 28, 36, 56, colorValue(paint.hex))
          .setStrokeStyle(1, 0x34342f)
          .setInteractive({ useHandCursor: true })
          .setData('paint', paint);
      });

      const bucket = this.add.circle(520, 318, 106, colorValue('#ffffff'))
        .setStrokeStyle(3, 0x34342f)
        .setInteractive({ useHandCursor: true });

      const targetHex = targetPaint.toString();
      const targetHsv = hexToHsv(targetHex);
      this.add.circle(850, 150, 72, colorValue(targetHex)).setStrokeStyle(2, 0x34342f);

      const meterX = 735;
      const meterWidth = 240;
      const scaleValues = [0.9, 0.99, 0.999, 0.9999];
      const logPosition = (proximity) => Math.min(
        1,
        -Math.log10(Math.max(0.0001, 1 - proximity)) / 4,
      );
      const scoreTracks = [
        { y: 292, color: colorValue(hsvToHex(targetHsv.h, 1, 1)) },
        { y: 340, color: colorValue(hsvToHex(targetHsv.h, targetHsv.s, 1)) },
        { y: 388, color: 0x34342f },
      ].map(({ y, color }) => {
        this.add.rectangle(meterX, y, meterWidth, 12, 0xd5d0c5).setOrigin(0, 0.5);
        const bar = this.add.rectangle(meterX, y, 0, 8, color).setOrigin(0, 0.5);
        const label = this.add.text(meterX, y - 23, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#252525',
        });
        return { y, bar, label };
      });
      const scaleStyle = {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        color: '#454545',
      };
      const totalStyle = {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#252525',
      };
      const totalScoreText = this.add.text(meterX, 440, '', totalStyle);
      const bestScoreText = this.add.text(meterX, 464, '', totalStyle);
      let bestScore = 0;
      scaleValues.forEach((value) => {
        const x = meterX + meterWidth * logPosition(value);
        this.add.text(x, 405, `${value * 100}%`, scaleStyle).setOrigin(0.5, 0);
      });
      const scaleMarks = this.add.graphics();
      scaleMarks.lineStyle(1, 0x34342f, 0.7);
      scoreTracks.forEach(({ y }) => {
        scaleValues.forEach((value) => {
          const x = meterX + meterWidth * logPosition(value);
          scaleMarks.beginPath();
          scaleMarks.moveTo(x, y - 7);
          scaleMarks.lineTo(x, y + 7);
          scaleMarks.strokePath();
        });
      });

      this.brushBase = this.add.circle(0, 0, 13, 0xf3f0e8)
        .setStrokeStyle(1, 0x34342f)
        .setDepth(10)
        .setVisible(false);
      this.brushFill = this.add.graphics().setDepth(11);
      this.brushProgress = this.add.graphics().setDepth(12);

      const drawBrush = () => {
        const { x, y } = this.pointerPosition;
        const fill = this.brushFill;
        const progress = this.brushProgress;
        fill.clear();
        progress.clear();
        this.brushBase.setPosition(x, y);

        if (this.charge > 0 && this.selectedPaint) {
          const steps = Math.ceil(this.charge * 48);
          fill.fillStyle(colorValue(this.selectedPaint.hex), 1);
          fill.beginPath();
          fill.moveTo(x, y);
          for (let step = 0; step <= steps; step += 1) {
            const angle = -Math.PI / 2 + (this.charge * Math.PI * 2 * step) / steps;
            fill.lineTo(x + Math.cos(angle) * 12, y + Math.sin(angle) * 12);
          }
          fill.closePath();
          fill.fillPath();
        }

        progress.lineStyle(3, 0x34342f, 0.35);
        progress.strokeCircle(x, y, 18);
        if (this.charge > 0 && this.selectedPaint) {
          progress.lineStyle(3, colorValue(this.selectedPaint.hex), 1);
          progress.beginPath();
          progress.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + this.charge * Math.PI * 2);
          progress.strokePath();
        }
      };
      this.drawBrush = drawBrush;

      const updateScores = () => {
        const bucketHsv = hexToHsv(this.bucketMix.toString());
        const hueDifference = Math.min(
          Math.abs(bucketHsv.h - targetHsv.h),
          1 - Math.abs(bucketHsv.h - targetHsv.h),
        );
        const scores = [
          1 - hueDifference * 2,
          1 - Math.abs(bucketHsv.s - targetHsv.s),
          1 - Math.abs(bucketHsv.v - targetHsv.v),
        ];
        scoreTracks.forEach((track, index) => {
          const score = Math.max(0, Math.min(1, scores[index]));
          track.bar.setSize(meterWidth * logPosition(score), 8);
          track.label.setText(`${['H', 'S', 'V'][index]} ${(score * 100).toFixed(1)}%`);
        });
        const totalScore = scores.reduce(
          (total, score) => total * Math.max(0, Math.min(1, score)),
          1,
        );
        bestScore = Math.max(bestScore, totalScore);
        totalScoreText.setText(`SCORE ${(totalScore * 100).toFixed(2)}%`);
        bestScoreText.setText(`BEST ${(bestScore * 100).toFixed(2)}%`);
      };

      swatches.forEach((swatch) => {
        swatch.on('pointerdown', (pointer) => {
          this.selectedPaint = swatch.getData('paint');
          this.charge = 0;
          this.chargeStart = this.time.now;
          this.isCharging = true;
          this.pointerPosition = { x: pointer.x, y: pointer.y };
          this.brushBase.setVisible(true);
          drawBrush();
        });
      });

      this.input.on('pointermove', (pointer) => {
        this.pointerPosition = { x: pointer.x, y: pointer.y };
        if (this.selectedPaint) drawBrush();
      });
      this.input.on('pointerup', () => {
        if (!this.isCharging) return;
        this.charge = Math.min(1, (this.time.now - this.chargeStart) / 1500);
        this.isCharging = false;
        drawBrush();
      });

      bucket.on('pointerdown', () => {
        if (!this.selectedPaint || this.charge <= 0) return;
        const paintAmount = this.charge;
        this.bucketMix = spectral.mix(
          [this.bucketMix, 1 - paintAmount],
          [this.selectedPaint.color, paintAmount],
        );
        bucket.setFillStyle(colorValue(this.bucketMix.toString()));
        updateScores();
      });

      updateScores();
    },
    update() {
      if (!this.isCharging) return;
      this.charge = Math.min(1, (this.time.now - this.chargeStart) / 1500);
      this.drawBrush();
    },
  },
});
