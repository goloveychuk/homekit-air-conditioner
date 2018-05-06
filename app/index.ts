import { Thermostat } from "./thermostat";

declare global {
    namespace NodeJS {
      interface Global {
        HomeBridgeService: any;
        Characteristic: any;
      }
    }
  }

export = function(homebridge: any) {
  global.HomeBridgeService = homebridge.hap.Service;
  global.Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory(
    "homebridge-thermostat",
    "Thermostat",
    Thermostat
  );
};
