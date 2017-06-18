import broadlink



devices = broadlink.discover(timeout=15)

device = devices[0]

device.auth()


def format(c):
    return " | ".join(map(lambda x: "%4.0f" % x, c))


def nor(a):
    if 14<a<25:
        return None
    if 40<a<60:
        return 0
    if 105<a<130:
        return 1
    return None
    
def normalize(r):
    # r = r[7:]
    r = map(nor, map(ord, r))
    r = filter(lambda x: x is not None, r)

    r = chunks(r, 4)
    r = list(r)
    return r

def chunks(l, n):
    """Yield successive n-sized chunks from l."""
    for i in range(0, len(l), n):
        yield l[i:i + n]

# devices[0].enter_learning()
# prev = None
# while True:

#     ir_packet = devices[0].check_data()
#     if ir_packet:
#         if ir_packet == prev:
#             continue

#         # print(format(map(ord, ir_packet)))
#         print(normalize(ir_packet))
#         prev = ir_packet
#         devices[0].enter_learning()
        
