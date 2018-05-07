import { Device, Modes as DeviceMode } from "./device";
import { debounce } from "lodash";

declare global {
  var HomeBridgeService: any;
  var Characteristic: any;
}

type Logger = (...data: any[]) => void;

class Config {
  maxTemp = 30;
  minTemp = 18;
  constructor(public name: string) {}
}

enum HeatingCoolingState {
  OFF = 0,
  HEAT = 1,
  COOL = 2,
  AUTO = 3
}

type Callback = (err: Error | null, val?: number | string) => void;

function TempCacheSub(
  deviceGetTemp: () => Promise<number>,
  cb: (value: number) => void
) {
  let lastTemp: number | undefined = undefined;
  let lastGot: number | undefined = undefined;

  const getTemp = async (): Promise<number> => {
    const now = new Date().getTime();
    if (
      lastGot === undefined ||
      lastTemp === undefined ||
      now - lastGot > 10_000
    ) {
      const temp = await deviceGetTemp();
      lastTemp = temp;
      lastGot = now;
    }
    return lastTemp;
  };

  setInterval(async () => {
    const t = await getTemp();
    cb(t);
  }, 60 * 1000);

  return getTemp;
}

class State {
  //Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
  //Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
  temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
  currentTemperature = 19;
  currentRelativeHumidity = 0.7;

  currentHeatingCoolingState = HeatingCoolingState.OFF;
  targetTemperature = 21;
  targetRelativeHumidity = 0.5;
  heatingThresholdTemperature = 25;
  coolingThresholdTemperature = 5;

  targetHeatingCoolingState = HeatingCoolingState.OFF;

  get<K extends keyof this>(key: K): this[K] {
    // console.log("getting", key);
    return this[key];
  }
  set(key: keyof this, value: any) {
    // console.log("setting", key, value);

    this[key] = value;
  }
}

type PrivateState = Pick<State, "get" | "set">;

export class Thermostat {
  log: Logger;
  state: PrivateState;
  config: Readonly<Config>;
  service: any;
  device: Device;
  name: string;
  getTempCached: Device['getTemperature']

  constructor(log: Logger, config: any) {
    this.log = log;
    log("huy");
    this.config = new Config(config.name);
    this.name = this.config.name;
    this.state = new State();

    this.device = new Device();

    this.service = new HomeBridgeService.Thermostat(this.config.name);

    this.getTempCached = TempCacheSub(this.device.getTemperature.bind(this.device), this.onTempChanged)
  }


  private onTempChanged = (val: number) => {
    this.service.setCharacteristic(Characteristic.CurrentTemperature, val);
  }


  //Start
  identify = (callback: Callback) => {
    this.log("Identify requested!");
    callback(null);
  };

  getName = (callback: Callback) => {
    callback(null, this.config.name);
  };

  getStateValue(key: keyof State) {
    return (cb: Callback) => {
      const val = this.state.get(key);
      cb(null, val);
    };
  }
  setStateValue(key: keyof State) {
    return (value: any, cb: Callback) => {
      this.state.set(key, value);
      cb(null);
    };
  }

  // Required
  // getCurrentHeatingCoolingState = (callback: Callback) => {
  //     // this.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentHeatingCoolingState); //todo
  // }

  _sendStateToDevice = async () => {
    let enabled = true;
    let mode: DeviceMode;
    switch (this.state.get("targetHeatingCoolingState")) {
      case HeatingCoolingState.OFF:
        enabled = false;
        mode = DeviceMode.AUTO;
        break;
      case HeatingCoolingState.HEAT:
        mode = DeviceMode.HEAT;
        break;
      case HeatingCoolingState.AUTO:
        mode = DeviceMode.AUTO;
        break;
      case HeatingCoolingState.COOL:
        mode = DeviceMode.COLD;
        break;
      default:
        throw new Error("smth wrong");
    }
    const targetTemp = this.state.get("targetTemperature");
    await this.device.send(enabled, mode, targetTemp);
  };

  sendStateToDevice = debounce(this._sendStateToDevice, 700);

  setTargetHeatingCoolingState = async (value: number, callback: Callback) => {
    if (value === undefined) {
      callback(null); //Some stuff call this without value doing shit with the rest
      return;
    }
    this.state.set("targetHeatingCoolingState", value);
    callback(null);
    await this.sendStateToDevice();
  };

  getCurrentTemperature = async (callback: Callback) => {
    const curTemp = await this.getTempCached()
    this.state.set("currentTemperature", curTemp);
    callback(null, this.state.get("currentTemperature"));
  };

  setTargetTemperature = async (value: number, callback: Callback) => {
    this.log("running setting temp", value);
    this.state.set("targetTemperature", value);
    callback(null);
    await this.sendStateToDevice();
  };

  // setTargetTemperature = debounce(this._setTargetTemperature, 1000)

  getServices() {
    var informationService = new HomeBridgeService.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Model")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

    // Required Characteristics
    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on("get", this.getStateValue("currentHeatingCoolingState"));

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on("get", this.getStateValue("targetHeatingCoolingState"))
      .on("set", this.setTargetHeatingCoolingState);

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on("get", this.getCurrentTemperature);

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .on("get", this.getStateValue("targetTemperature"))
      .on("set", this.setTargetTemperature);

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on("get", this.getStateValue("temperatureDisplayUnits"))
      .on("set", this.setStateValue("temperatureDisplayUnits"));

    // Optional Characteristics
    this.service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on("get", this.getStateValue("currentRelativeHumidity"));

    this.service
      .getCharacteristic(Characteristic.TargetRelativeHumidity)
      .on("get", this.getStateValue("targetRelativeHumidity"))
      .on("set", this.setStateValue("targetRelativeHumidity"));
    /*
		this.service
			.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.on('get', this.getCoolingThresholdTemperature);
		*/

    this.service
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .on("get", this.getStateValue("heatingThresholdTemperature"));

    this.service.getCharacteristic(Characteristic.Name).on("get", this.getName);

    this.service.getCharacteristic(Characteristic.CurrentTemperature).setProps({
      minValue: this.config.minTemp,
      maxValue: this.config.maxTemp,
      minStep: 1
    });
    this.service.getCharacteristic(Characteristic.TargetTemperature).setProps({
      minValue: this.config.minTemp,
      maxValue: this.config.maxTemp,
      minStep: 1
    });

    return [informationService, this.service];
  }
}
