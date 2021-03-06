import { Modes as DeviceMode } from "./device";
import { Device } from "./Device.1";
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
const DEFAULT_HEATING_COOLING_STATE = HeatingCoolingState.COOL

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
  }, 5 * 60 * 1000);

  return getTemp;
}

class State {
  temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
  currentTemperature = 19;
  targetTemperature = 21;
  targetHeatingCoolingState = HeatingCoolingState.OFF;
  previousHeatingCoolingState = HeatingCoolingState.OFF;

  get<K extends keyof this>(key: K): this[K] {
    return this[key];
  }
  set(key: keyof this, value: any) {
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
    this.config = new Config(config.name);
    this.name = this.config.name;
    this.state = new State();

    this.device = new Device();

    this.service = new HomeBridgeService.Thermostat(this.config.name);

    this.getTempCached = TempCacheSub(this.device.getTemperature.bind(this.device), this.onTempChanged)
  }


  private onTempChanged = (val: number) => {
    this.state.set('currentTemperature', val)
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

  sendStateToDevice = async () => {
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


  setTargetHeatingCoolingState = async (value: HeatingCoolingState, callback: Callback) => {
    this.log('setTargetHeatingCoolingState', value)
    if (value === undefined) {
      callback(null);
      return;
    }
    if (value === HeatingCoolingState.OFF) {
      const curHeatCoolState = this.state.get('targetHeatingCoolingState')
      const prevCoolState = curHeatCoolState !== HeatingCoolingState.OFF ? curHeatCoolState : DEFAULT_HEATING_COOLING_STATE
      this.state.set('previousHeatingCoolingState', prevCoolState)
    }
    this.state.set("targetHeatingCoolingState", value);
    callback(null);
    await this.sendStateToDevice();
  };

  getCurrentTemperature = async (callback: Callback) => {   
    this.log('getCurrentTemperature')
    const curTemp = await this.getTempCached()
    this.state.set("currentTemperature", curTemp);
    callback(null, this.state.get("currentTemperature"));
  };
  private turnOnOnSetTemp() {
    if (this.state.get('targetHeatingCoolingState') === HeatingCoolingState.OFF) {
      this.state.set('targetHeatingCoolingState', this.state.get('previousHeatingCoolingState'))
      this.service.setCharacteristic(Characteristic.TargetHeatingCoolingState, this.state.get('targetHeatingCoolingState'));    
    }
  }
  sendStateToDeviceCached = debounce(this.sendStateToDevice, 700);
  
  setTargetTemperature = async (value: number, callback: Callback) => {
    this.log('setTargetTemperature', value)
    this.state.set("targetTemperature", value);
    this.turnOnOnSetTemp()
    callback(null);
    await this.sendStateToDeviceCached();
  };


  getServices() {
    var informationService = new HomeBridgeService.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Model")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

    // Required Characteristics
    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on("get", this.getStateValue("targetHeatingCoolingState"));

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
