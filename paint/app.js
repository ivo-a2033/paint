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
  const hue = column / 8;
  const value = 0.2 + (row / 7) * 0.8;
  const hex = hsvToHex(hue, 1, value);
  return { hex, color: new spectral.Color(hex) };
});

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

function makeTargetPaint() {
  return new spectral.Color(hsvToHex(
    Math.random(),
    0.82 + Math.random() * 0.18,
    0.82 + Math.random() * 0.18,
  ));
}

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
      this.pointerPosition = { x: 0, y: 0 };
      let targetPaint = makeTargetPaint();
      let targetHex = targetPaint.toString();
      let targetHsv = hexToHsv(targetHex);
      let roundRevealed = false;
      let currentBestScore = 0;
      let currentBestColor = '#ffffff';
      let bestScore = 0;

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

      const buckets = [410, 780].map((x) => {
        const bucket = {
          paint: new spectral.Color('#ffffff'),
          shape: this.add.circle(x, 175, 54, colorValue('#ffffff'))
            .setStrokeStyle(3, 0x34342f)
            .setInteractive({ useHandCursor: true }),
        };
        return bucket;
      });

      const targetShape = this.add.circle(920, 150, 64, colorValue(targetHex))
        .setStrokeStyle(2, 0x34342f);
      const bestShadeOverlay = this.add.circle(920, 150, 36, colorValue('#ffffff'))
        .setStrokeStyle(2, 0x34342f)
        .setAlpha(0.8)
        .setVisible(false);

      const roundButton = this.add.rectangle(920, 235, 100, 36, 0x34342f)
        .setInteractive({ useHandCursor: true });
      const roundButtonText = this.add.text(920, 235, 'DONE', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
      }).setOrigin(0.5);

      const gradientX = 475;
      const gradientY = 164;
      const gradientWidth = 240;
      const gradientHeight = 22;
      const graphX = gradientX;
      const graphY = 245;
      const graphWidth = gradientWidth;
      const graphHeight = 145;
      const gradientDisplay = this.add.graphics();
      const scoreGraph = this.add.graphics();

      const meterX = 820;
      const meterWidth = 190;
      const meterCenter = meterX + meterWidth / 2;
      const logDifferencePosition = (difference, limit) => {
        const magnitude = Math.min(1, Math.abs(difference) / limit);
        return Math.log1p(magnitude * 999) / Math.log1p(999);
      };
      const scoreTracks = [292, 340, 388].map((y) => {
        const background = this.add.rectangle(meterX, y, meterWidth, 12, 0xd5d0c5)
          .setOrigin(0, 0.5);
        const bar = this.add.rectangle(meterX, y, 0, 8, 0x34342f).setOrigin(0, 0.5);
        const label = this.add.text(meterX, y - 23, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#252525',
        });
        return { y, background, bar, label };
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
      const scaleLabels = [];
      scoreTracks.forEach((track, index) => {
        const edgeValue = index === 0 ? '180°' : '100%';
        const y = track.y + 8;
        scaleLabels.push(this.add.text(meterX, y, `-${edgeValue}`, scaleStyle));
        scaleLabels.push(this.add.text(meterCenter, y, '0', scaleStyle).setOrigin(0.5, 0));
        scaleLabels.push(this.add.text(meterX + meterWidth, y, `+${edgeValue}`, scaleStyle)
          .setOrigin(1, 0));
      });
      const scaleMarks = this.add.graphics();
      scaleMarks.lineStyle(1, 0x34342f, 0.7);
      scoreTracks.forEach(({ y }) => {
        [meterX, meterCenter, meterX + meterWidth].forEach((x) => {
          scaleMarks.beginPath();
          scaleMarks.moveTo(x, y - 7);
          scaleMarks.lineTo(x, y + 7);
          scaleMarks.strokePath();
        });
      });
      const evaluationObjects = [
        scoreGraph,
        bestShadeOverlay,
        scaleMarks,
        totalScoreText,
        bestScoreText,
        ...scaleLabels,
        ...scoreTracks.flatMap((track) => [track.background, track.bar, track.label]),
      ];
      evaluationObjects.forEach((object) => object.setVisible(false));

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
        const shades = spectral.palette(buckets[0].paint, buckets[1].paint, 100);
        const shadeScores = shades.map((shade) => {
          const hsv = hexToHsv(shade.toString());
          let hueDifference = hsv.h - targetHsv.h;
          if (hueDifference > 0.5) hueDifference -= 1;
          else if (hueDifference < -0.5) hueDifference += 1;
          const proximities = [
            1 - Math.abs(hueDifference) * 2,
            1 - Math.abs(hsv.s - targetHsv.s),
            1 - Math.abs(hsv.v - targetHsv.v),
          ].map((score) => Math.max(0, Math.min(1, score)));
          return {
            proximities,
            differences: [hueDifference, hsv.s - targetHsv.s, hsv.v - targetHsv.v],
            score: proximities.reduce((total, score) => total * score, 1),
            hex: shade.toString(),
          };
        });
        const bestShade = shadeScores.reduce((best, shade) => (
          shade.score > best.score ? shade : best
        ));

        gradientDisplay.clear();
        shades.forEach((shade, index) => {
          gradientDisplay.fillStyle(colorValue(shade.toString()), 1);
          gradientDisplay.fillRect(
            gradientX + (gradientWidth * index) / shades.length,
            gradientY,
            gradientWidth / shades.length + 0.25,
            gradientHeight,
          );
        });

        scoreGraph.clear();
        scoreGraph.lineStyle(1, 0xb9b3a7, 0.55);
        [0.25, 0.5, 0.75].forEach((score) => {
          const y = graphY + graphHeight * (1 - score);
          scoreGraph.beginPath();
          scoreGraph.moveTo(graphX, y);
          scoreGraph.lineTo(graphX + graphWidth, y);
          scoreGraph.strokePath();
        });
        scoreGraph.lineStyle(1, 0x34342f, 0.65);
        scoreGraph.strokeRect(graphX, graphY, graphWidth, graphHeight);
        scoreGraph.lineStyle(2, 0x252525, 1);
        scoreGraph.beginPath();
        shadeScores.forEach((shade, index) => {
          const x = graphX + (graphWidth * index) / (shadeScores.length - 1);
          const y = graphY + graphHeight * (1 - shade.score);
          if (index === 0) scoreGraph.moveTo(x, y);
          else scoreGraph.lineTo(x, y);
        });
        scoreGraph.strokePath();
        const bestIndex = shadeScores.indexOf(bestShade);
        const bestX = graphX + (graphWidth * bestIndex) / (shadeScores.length - 1);
        const bestY = graphY + graphHeight * (1 - bestShade.score);
        scoreGraph.fillStyle(0xffffff, 1);
        scoreGraph.fillCircle(bestX, bestY, 4);
        scoreGraph.lineStyle(2, 0x252525, 1);
        scoreGraph.strokeCircle(bestX, bestY, 4);

        const trackColors = [
          colorValue(hsvToHex(targetHsv.h, 1, 1)),
          colorValue(hsvToHex(targetHsv.h, targetHsv.s, 1)),
          0x34342f,
        ];
        scoreTracks.forEach((track, index) => {
          const difference = bestShade.differences[index];
          const limit = index === 0 ? 0.5 : 1;
          const extent = (meterWidth / 2) * logDifferencePosition(difference, limit);
          track.bar.setFillStyle(trackColors[index]);
          track.bar.setPosition(difference < 0 ? meterCenter - extent : meterCenter, track.y);
          track.bar.setSize(extent, 8);
          const displayDifference = index === 0 ? difference * 360 : difference * 100;
          const suffix = index === 0 ? '°' : '%';
          const sign = displayDifference > 0 ? '+' : '';
          track.label.setText(`${['H', 'S', 'V'][index]} ${sign}${displayDifference.toFixed(1)}${suffix}`);
        });
        currentBestScore = bestShade.score;
        currentBestColor = bestShade.hex;
        totalScoreText.setText(`SCORE ${(bestShade.score * 100).toFixed(2)}%`);
        bestScoreText.setText(`BEST ${(Math.max(bestScore, currentBestScore) * 100).toFixed(2)}%`);
      };

      const startNextRound = () => {
        roundRevealed = false;
        targetPaint = makeTargetPaint();
        targetHex = targetPaint.toString();
        targetHsv = hexToHsv(targetHex);
        targetShape.setFillStyle(colorValue(targetHex));
        buckets.forEach((bucket) => {
          bucket.paint = new spectral.Color('#ffffff');
          bucket.shape.setFillStyle(colorValue('#ffffff'));
        });
        this.selectedPaint = null;
        this.charge = 0;
        this.isCharging = false;
        this.brushBase.setVisible(false);
        this.brushFill.clear();
        this.brushProgress.clear();
        evaluationObjects.forEach((object) => object.setVisible(false));
        roundButtonText.setText('DONE');
        updateScores();
      };

      roundButton.on('pointerdown', () => {
        if (roundRevealed) {
          startNextRound();
          return;
        }
        roundRevealed = true;
        bestScore = Math.max(bestScore, currentBestScore);
        bestScoreText.setText(`BEST ${(bestScore * 100).toFixed(2)}%`);
        bestShadeOverlay.setFillStyle(colorValue(currentBestColor));
        evaluationObjects.forEach((object) => object.setVisible(true));
        roundButtonText.setText('NEXT');
      });

      swatches.forEach((swatch) => {
        swatch.on('pointerdown', (pointer) => {
          if (roundRevealed) return;
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

      buckets.forEach((bucket) => {
        bucket.shape.on('pointerdown', () => {
          if (roundRevealed || !this.selectedPaint || this.charge <= 0) return;
          const paintAmount = this.charge;
          bucket.paint = spectral.mix(
            [bucket.paint, 1 - paintAmount],
            [this.selectedPaint.color, paintAmount],
          );
          bucket.shape.setFillStyle(colorValue(bucket.paint.toString()));
          updateScores();
        });
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
