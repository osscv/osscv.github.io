class FloatRingBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Float32Array(size);
    this.index = 0;
  }

  resize(newSize) {
    if (newSize === this.size) {
      return;
    }
    this.buffer = this.getBuffer(-Math.min(this.size, newSize), newSize);
    this.size = newSize;
    this.index = 0;
  }

  getIndex(offset) {
    return (this.index + offset) % this.size;
  }

  getBuffer(offset, size) {
    let outputSize = size;
    if (size > this.size) {
      outputSize = size;
      size = this.size;
    }
    const start = this.getIndex(offset);
    const out = new Float32Array(outputSize);
    // copy the first part of the buffer
    const firstPart = Math.min(size, this.size - start);
    out.set(this.buffer.subarray(start, start + firstPart));
    // copy the rest from the beginning of the buffer
    if (firstPart < size) {
      out.set(this.buffer.subarray(0, size - firstPart), firstPart);
    }
    return out;
  }

  pushBuffer(offset, buffer) {
    if (buffer.length > this.size) {
      throw new Error('Buffer is larger than the ring buffer');
    }
    const start = this.getIndex(offset);
    const firstPart = Math.min(buffer.length, this.size - start);
    this.buffer.set(buffer.subarray(0, firstPart), start);
    if (firstPart < buffer.length) {
      this.buffer.set(buffer.subarray(firstPart), 0);
    }
    this.index = (start + buffer.length) % this.size;
  }
}

class Filter {
  constructor(frequency, samplerate) {
    const dt = 1.0 / samplerate;
    const rc = 1.0 / (2 * Math.PI * frequency);
    this.lastX = 0;
    this.lastY = 0;
    this.tch = rc / (rc + dt);
    this.tcl = dt / (rc + dt);
  }
  highpass(nextX) {
    const newY = this.tch * (this.lastY + nextX - this.lastX);
    this.lastX = nextX;
    this.lastY = newY;
    return newY;
  }
  lowpass(nextX) {
    const newY = this.tcl * nextX + (1 - this.tcl) * this.lastY;
    this.lastY = newY;
    return newY;
  }
}


class LCC {
  constructor(options) {
    this.previousOutput = new FloatRingBuffer(0);
    this.configure(options);
  }

  configure({
    inputgain,
    decaygain,
    endgain,
    centergain,
    microdelay,
    samplerate,
    highpass,
    lowpass,
  }) {
    const delay = microdelay * 1e-6 * samplerate;
    this.bufflen = Math.ceil(delay) * 2;
    this.delaymod = this.bufflen / 2 - delay;
    this.previousOutput.resize(this.bufflen);

    this.inputgain = inputgain;
    this.decaygain = decaygain;
    this.endgain = endgain;
    this.centergain = centergain;

    this.highpass1 = new Filter(highpass, samplerate);
    this.lowpass1 = new Filter(lowpass, samplerate);

    this.highpass2 = new Filter(highpass, samplerate);
    this.lowpass2 = new Filter(lowpass, samplerate);

    console.debug('LCC configured', this);
  }

  lcc(input1, input2, output1, output2) {
    const len = input1.length;
    const bufflen = this.bufflen;
    const prevOutput = this.previousOutput.buffer;
    const index = this.previousOutput.index;
    const centerconstant = this.centergain * this.inputgain / 2.0;
    for (let i = 0; i < len; i++) {
      const in1 = input1[i] * this.inputgain;
      const in2 = input2[i] * this.inputgain;

      const in1filtered = this.lowpass1.lowpass(this.highpass1.highpass(in1));
      const in2filtered = this.lowpass2.lowpass(this.highpass2.highpass(in2));

      const diff1 = in1 - in1filtered;
      const diff2 = in2 - in2filtered;

      const prevIndex = (index + i * 2) % bufflen;

      const out1 = in1filtered - this.decaygain * prevOutput[prevIndex + 1];
      const out2 = in2filtered - this.decaygain * prevOutput[prevIndex];

      prevOutput[prevIndex] = out1;
      prevOutput[prevIndex + 1] = out2;

      const center = (in1filtered + in2filtered) * centerconstant;
      output1[i] = this.endgain * (out1 + center + diff1);
      output2[i] = this.endgain * (out2 + center + diff2);
    }
    this.previousOutput.index = (index + len * 2) % bufflen;
    return true;
  }
}

registerProcessor('crosstalk-worklet', class CrosstalkWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._closed = false;

    options.processorOptions.samplerate = sampleRate;
    this.lcc = new LCC(options.processorOptions);

    this.port.onmessage = (event) => {
      if (event.data.type === 'close') {
        this.close();
      } else if (event.data.type === 'configure') {
        event.data.options.samplerate = sampleRate;
        this.lcc.configure(event.data.options);
      }
    };
  }

  process(inputs, outputs) {
    if (this._closed) {
      return false;
    }
    return this.lcc.lcc(inputs[0][0], inputs[0][1], outputs[0][0], outputs[0][1]);
  }

  close() {
    console.debug('closing crosstalk worklet');
    this._closed = true;
  }
});