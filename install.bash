
# didnt test
sudo ln -s ./*.service /etc/systemd/system/
sudo systemctl reload
sudo systemctl enable homebridge.service thermostat.service
sudo systemctl restart homebridge.service thermostat.service