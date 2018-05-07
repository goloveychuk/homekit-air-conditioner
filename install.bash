
# didnt test
sudo cp -f ./homebridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable homebridge.service
sudo systemctl restart homebridge.service