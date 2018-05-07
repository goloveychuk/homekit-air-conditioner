import { EventEmitter } from "events";

const BroadlinkDriver = require("broadlinkjs-rm");

const Codes = {
  ONE: 48,
  ZERO: 114,
  SPACE: 18,
  HEADER: [38, 0, 104, 0, 199],
  HEADER2: 245,
  END: [0, 13, 5]
};

export enum Modes {
  COLD = 1,
  HEAT = 3,
  DRY = 2,
  AUTO = 0
}

function serialize(msg: number[]) {
  const s = new Array<number>();
  s.push(...Codes.HEADER);
  s.push(Codes.HEADER2);
  s.push(Codes.SPACE);

  for (const i of msg) {
    if (i === 1) {
      s.push(Codes.ONE);
    } else {
      s.push(Codes.ZERO);
    }

    s.push(Codes.SPACE);
  }

  s.push(Codes.HEADER2);
  s.push(Codes.SPACE);
  s.push(...Codes.END);
  return s;
}

function invert(a: number[]) {
  return a.map(n => (n === 1 ? 0 : 1));
}

function oneOrZero(n: number) {
  if (n === 0) {
    return 0;
  }
  return 1;
}

function payload(enabled: boolean, mode: Modes, temp: number) {
  temp = temp - 17;
  const s = new Array<number>();

  const g1 = [0, 0, 0, 0];
  const g2 = [0, 0, 0, 0];

  const modeG = [oneOrZero(mode & 0b01), oneOrZero(mode & 0b10)];

  const onG = enabled ? [0, 1] : [0, 0];

  const g3 = modeG.concat(onG);

  const g4 = [
    oneOrZero(temp & 0b0001),
    oneOrZero(temp & 0b0010),
    oneOrZero(temp & 0b0100),
    oneOrZero(temp & 0b1000)
  ]; //  big endian

  const g5 = [1, 0, 1, 0];
  const g6 = [1, 0, 1, 1];

  s.push(...g1);
  s.push(...g2);
  s.push(...invert(g1));
  s.push(...invert(g2));

  s.push(...g3);
  s.push(...g4);
  s.push(...invert(g3));
  s.push(...invert(g4));

  s.push(...g5);
  s.push(...g6);
  s.push(...invert(g5));
  s.push(...invert(g6));

  return s;
}

type BroadlinkDevice = EventEmitter & {
  checkTemperature(): void;
  sendData(data: Buffer): void;
};

export class Device {
  private device?: BroadlinkDevice;

  private temperatureResolve?: (data: number) => void;

  constructor() {}

  private onTemperature = (data: number) => {
    if (this.temperatureResolve) {
      this.temperatureResolve(data);
      this.temperatureResolve = undefined;
    }
  };

  async connect() {
    if (this.device) {
      return;
    }
    const broadlink = new BroadlinkDriver();
    broadlink.discover();

    return new Promise(resolve => {
      broadlink.on("deviceReady", (device: BroadlinkDevice) => {
        this.device = device;
        this.device.on("temperature", (data: number) => {
          this.onTemperature(data);
        });
        resolve();
      });
    });
  }

  async getTemperature(): Promise<number> {
    await this.connect();
    if (this.device === undefined) {
      throw new Error("device is undef");
    }
    const prom = new Promise<number>(resolve => {
      this.temperatureResolve = resolve;
    });
    this.device.checkTemperature();
    return prom;
  }

  async send(enabled: boolean, mode: Modes, targetTemp: number) {
    await this.connect();

    if (this.device === undefined) {
      throw new Error("device is undef");
    }

    const p = payload(enabled, mode, targetTemp);

    const msg = serialize(p);

    const buf = Buffer.from(msg);

    this.device.sendData(buf);
  }
}
