const BroadlinkDriver = require("broadlinkjs-rm");
import { BroadlinkDevice, nor, chunkArray, Modes, payload, serialize } from "./device";
export class Device {
  private device?: BroadlinkDevice;
  private temperatureResolve?: (data: number) => void;
  constructor() { }
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
  learn() {
    if (this.device === undefined) {
      throw new Error("device is undef");
    }
    this.device.enterLearning();
    const cb = (_d: any) => {
      const d1 = Array.from(_d) as number[];
      const d2 = d1.map(nor).filter(a => a !== null);
      const d3 = chunkArray(d2, 4);
      const d4 = d3.map(i => i.join("")).join(" ");
      console.log(d4);
      console.log("=================");
      this.device.removeListener("rawData", cb);
      this.learn();
    };
    this.device.on("rawData", cb);
    setInterval(() => {
      this.device.checkData();
    }, 3000);
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
