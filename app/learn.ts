import { Device } from "./Device.1";

async function learn() {
  const device = new Device();
  await device.connect();
  console.log("connected");
  device.learn();
}

learn();
