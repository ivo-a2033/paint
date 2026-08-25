#include <Arduino.h>
#include <I2S.h>
#include "audio.h"

I2S i2s(OUTPUT);

const int BCLK = 18;
const int DIN  = 20;

const int SAMPLE_RATE = 22050;
const float VOLUME = 0.2f;

void setup() {
    i2s.setBCLK(BCLK);
    i2s.setDOUT(DIN);
    i2s.setBitsPerSample(16);

    if (!i2s.begin(SAMPLE_RATE)) {
        while (true) {
            delay(1000);
        }
    }
}

void loop() {
    for (size_t i = 0; i < audioSamples; i++) {
        int16_t sample = (int16_t)(audio[i] * VOLUME);

        // MAX98357 is mono, so send the same sample
        // to both I2S channels.
        i2s.write(sample);
        i2s.write(sample);
    }

    delay(1000);
}