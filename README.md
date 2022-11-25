# Foscam Floodlight Plugin for Scrypted

This plugin enables control of the Floodlights (On/Off and Brightness) via Scrypted. For the cameras use either RTSP or ONVIF plugins.

Tested with [Foscam 2K 4MP Outdoor Floodlight Security Camera](https://www.foscammall.com/products/foscam-security-motion-tracking-floodlight-camera).

* System Firmware: 1.17.2.9
* Application Firmware: 2.134.2.34

To setup

* Install the **foscam-floodlight-control** plugin
* **Add Device** from the plugin page.
* On the device page set the **Floodlight IP**. For Foscam this typically would be *192.168.xx.xx:88*.
* Set the camera **username** and **password** and hit **Save**.
* That should setup the Light in Scrypted. You can setup the enable whatever additional integrations like (HomeKit) you want after this.
