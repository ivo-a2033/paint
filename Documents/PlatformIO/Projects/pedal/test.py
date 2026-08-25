"""
Reads the raw uint16 little-endian ADC stream from the Pico over serial
and plays it back live through your speakers/headphones.

pip install pyserial sounddevice scipy numpy
"""

import sys
import threading
import queue
import numpy as np
import serial
import sounddevice as sd
from scipy.signal import lfilter, lfilter_zi

PORT = "/dev/ttyACM0"   # change to your port, e.g. "COM5" on Windows,
                          # "/dev/tty.usbmodemXXXX" on macOS
BAUD = 921600             # ignored by native USB CDC, harmless to set
SAMPLE_RATE = 40000        # must match the sketch's sample_rate
GAIN = 8.0                 # turn up/down if too quiet/loud/clippy

# Same DC-blocking highpass idea as on the board: removes the ~2048
# mid-scale bias so it plays as centered audio instead of a loud thump.
# y[n] = x[n] - x[n-1] + R*y[n-1]
DC_R = 0.995
_b = [1.0, -1.0]
_a = [1.0, -DC_R]
_zi = lfilter_zi(_b, _a) * 2048.0  # start centered at ADC mid-scale

sample_queue: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)


def serial_reader(port):
    ser = serial.Serial(port, BAUD, timeout=1)
    while True:
        raw = ser.read(1024)  # 512 samples worth per read
        if len(raw) < 2:
            continue
        n = len(raw) - (len(raw) % 2)  # drop any odd trailing byte
        samples = np.frombuffer(raw[:n], dtype="<u2").astype(np.float32)
        sample_queue.put(samples)


_leftover = np.zeros(0, dtype=np.float32)


def audio_callback(outdata, frames, time_info, status):
    global _zi, _leftover
    if status:
        print(status, file=sys.stderr)

    parts = [_leftover]
    total = _leftover.size
    while total < frames:
        try:
            chunk = sample_queue.get_nowait()
        except queue.Empty:
            chunk = np.zeros(frames - total, dtype=np.float32)  # underrun -> silence
        parts.append(chunk)
        total += chunk.size

    collected = np.concatenate(parts)
    outgoing = collected[:frames]
    _leftover = collected[frames:]

    filtered, _zi = lfilter(_b, _a, outgoing, zi=_zi)
    scaled = np.clip(filtered * GAIN, -32768, 32767).astype(np.int16)
    scaled = np.repeat(scaled[::16],16)
    outdata[:, 0] = scaled


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else PORT
    t = threading.Thread(target=serial_reader, args=(port,), daemon=True)
    t.start()

    with sd.OutputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16",
                          callback=audio_callback, blocksize=512):
        print(f"Playing live from {port}... Ctrl+C to stop.")
        try:
            while True:
                sd.sleep(1000)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()