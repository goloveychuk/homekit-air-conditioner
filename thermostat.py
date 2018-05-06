import broadlink
import json
from time import time





class Device(object):
    def __init__(self):
        self.connect()

    def connect(self):
        devices = broadlink.discover(timeout=15)
        self.device = devices[0]
        self.device.auth()
        self.last_checked_temp = None
        self.prev_temp = 19

    def send_data(self, data):
        try:
            return self.device.send_data(data)
        except:
            self.connect()
            raise
            
    def check_temperature(self):
        if self.last_checked_temp is not None and time() - self.last_checked_temp < 60:
            return self.prev_temp

        self.last_checked_temp = time()

        try:
            self.prev_temp = self.device.check_temperature()
            print('current temp {}'.format(self.prev_temp))
            return self.prev_temp
            
        except:
            self.connect()
            raise


device = Device()



from flask import Flask
app = Flask(__name__)

class State:
    def __init__(self):
        self.targetHeatingCoolingState = 0
        self.currentHeatingCoolingState = 0

        self.targetTemperature = 25.0
        self.currentTemperature = 25.0

        self.targetRelativeHumidity = 0.0
        self.currentRelativeHumidity = 0.0
    
    def update(self):
        currentTemp = device.check_temperature()
        print(currentTemp)
        self.currentTemperature = round(currentTemp)


    def send(self):
        enabled = True
        mode = None
        targetTemp = int(self.targetTemperature)

        if self.targetHeatingCoolingState == 0:
            enabled = False
            mode = AUTO
        elif self.targetHeatingCoolingState == 1:
            mode = HEAT
        elif self.targetHeatingCoolingState == 2:
            mode = COLD
        elif self.targetHeatingCoolingState == 3:
            mode = AUTO
            # targetTemp -= 1

        p = payload(enabled, mode, targetTemp)

        msg = Serialize(p)
        device.send_data(msg)





state = State()

@app.route("/status")
def status():
    state.update()
    resp = json.dumps(state.__dict__)
    print(resp)
    return resp

@app.route("/targetTemperature/<int:temp>")
def set_temp(temp):
    state.update()
    state.targetTemperature = temp
    state.send()
    return 'ok', 200

@app.route("/targetHeatingCoolingState/<int:mode>")
def set_mode(mode):
    state.update()    
    state.currentHeatingCoolingState = mode
    state.targetHeatingCoolingState = mode
    state.send()    
    return 'ok', 200