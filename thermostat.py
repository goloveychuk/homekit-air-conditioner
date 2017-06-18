import broadlink
import json

devices = broadlink.discover(timeout=15)

device = devices[0]

device.auth()


ONE = 48
ZERO = 114
SPACE = 18
HEADER = [38, 0, 104, 0, 199]
HEADER2 = 245
END = [0, 13, 5]

COLD  = 1
HEAT = 3
DRY = 2
AUTO = 0


def Serialize(msg):
    s = bytearray()
    s.extend(HEADER)
    s.append(HEADER2)
    s.append(SPACE)

    for i in msg:
        if i == 1:
            s.append(ONE)
        else:
            s.append(ZERO)
        
        s.append(SPACE)
    
    s.append(HEADER2)
    s.append(SPACE)
    s.extend(END)
    return s


def invert(a):
    return map(lambda x: 1 if x == 0 else 0, a)

def payload(enabled, mode, temp):
    temp = temp - 17
    s = bytearray()

    g1 = [0, 0, 0, 0]
    g2 = [0, 0, 0, 0]

    modeG = [
        bool(mode & 0b01),
        bool(mode & 0b10)
    ]

    onG = [0, 1] if enabled else [0, 0]

    g3 = modeG + onG
    
    g4 = [
        bool(temp & 0b0001),
        bool(temp & 0b0010),
        bool(temp & 0b0100),
        bool(temp & 0b1000),
    ] # big endian

    g5 = [1, 0, 1, 0]
    g6 = [1, 0, 1, 1]

    s.extend(g1)
    s.extend(g2)
    s.extend(invert(g1))
    s.extend(invert(g2))

    s.extend(g3)
    s.extend(g4)
    s.extend(invert(g3))
    s.extend(invert(g4))

    s.extend(g5)
    s.extend(g6)
    s.extend(invert(g5))
    s.extend(invert(g6))

    return s


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
        self.currentTemperature = int(currentTemp)


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

app.run()