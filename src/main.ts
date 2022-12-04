import sdk, { DeviceProvider, DeviceCreator, Setting, DeviceCreatorSettings, Settings, SettingValue, OnOff, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Brightness } from '@scrypted/sdk';
import axios from 'axios';
import { randomBytes } from "crypto";
import { DOMParserImpl as dom } from 'xmldom-ts';
import * as xpath from 'xpath-ts';

const { deviceManager } = sdk;


const FLOODLIGHT_IP_KEY: string = "floodlight-ip"
const FLOODLIGHT_USER_KEY: string = "floodlight-username"
const FLOODLIGHT_PASSWORD_KEY: string = "floodlight-password"
const NIGHT_LIGHT_HDR_FIX_KEY: string = "night-light-hdr-fix"

type whiteLightBrightnessData = [result: number, enable? :number, brightness?: number, lightinterval?: number];
type hdrModeData = [result: number, mode?: number];
type devStateData = [result: number, infraLedState?: number];

class FoscamFloodlightDevice extends ScryptedDeviceBase implements Settings, OnOff, Brightness {

    lightinterval: number = 60
    infraLedState: number = -1

    constructor(nativeId?: string) {
        super(nativeId);
        this.updateState()
    }

    async getSettings(): Promise<Setting[]> {
        return [
            {
                title: 'Floodlight IP',
                description: 'The floodlight ip address.',
                key: FLOODLIGHT_IP_KEY,
                type: 'string',
                placeholder: '192.168.0.100:88',
                value: this.storage.getItem(FLOODLIGHT_IP_KEY),
            },
            {
                title: 'Username',
                key: FLOODLIGHT_USER_KEY,
                type: 'string',
                value: this.storage.getItem(FLOODLIGHT_USER_KEY),
            },
            {
                title: 'Password',
                key: FLOODLIGHT_PASSWORD_KEY,
                type: 'password',
                value: this.storage.getItem(FLOODLIGHT_PASSWORD_KEY),
            },
            {
                title: 'Night Light HDR Fix',
                key: NIGHT_LIGHT_HDR_FIX_KEY,
                type: 'boolean',
                value: this.storage.getItem(NIGHT_LIGHT_HDR_FIX_KEY),
            },
        ];
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        if (key === FLOODLIGHT_IP_KEY
            || key === FLOODLIGHT_USER_KEY
            || key === FLOODLIGHT_PASSWORD_KEY
            || key === NIGHT_LIGHT_HDR_FIX_KEY) {
            this.storage.setItem(key, value.toString());
            this.updateState()
            this.onDeviceEvent(ScryptedInterface.Settings, key);
            return;
        }
    }

    get ipAddress() {
        return this.storage.getItem(FLOODLIGHT_IP_KEY)
    }

    get userName() {
        return this.storage.getItem(FLOODLIGHT_USER_KEY)
    }

    get password() {
        return this.storage.getItem(FLOODLIGHT_PASSWORD_KEY)
    }

    get nightLightHDRFix() {
        return this.storage.getItem(NIGHT_LIGHT_HDR_FIX_KEY)
    }

    async updateState() {
        if (this.ipAddress == null
            || this.userName == null
            || this.password == null) {
            this.on = this.on || false;
            return;
        }

        const brightnessData = await this.getWhiteLightState();
        if (brightnessData && brightnessData[0] === 0) {
            this.brightness = brightnessData[2]
            this.lightinterval = brightnessData[3]

            this.on = (brightnessData[1] === 1);
        } else {
            this.on = this.on || false;
        }

        this.pollDeviceState();

    }

    async pollDeviceState() {
        do {
            await new Promise(f => setTimeout(f, 2000));
            const devState = await this.getDevState();
            var infraLedStateChanged = false;
            if (devState && devState[0] === 0) {
                if (this.infraLedState != devState[1]) {
                    infraLedStateChanged = true;
                    this.infraLedState = devState[1];
                }
                // Work around a bug in the current Foscam Floodlight firmware where if the night mode toggles
                // it looses hdr effect even though the option returns true, unless we call the setHdrMode again.
                // Foscam support indicated they will pass on this bug to their R&D team, but I am not sure
                // when or if a fix will be available.
                if (infraLedStateChanged) {
                    const hdrData = await this.getHdrMode();
                    if(hdrData && hdrData[0] === 0 && hdrData[1] === 1) {
                        await new Promise(f => setTimeout(f, 2000));
                        await this.setHdrMode(true);
                    }
                }
            }
        } while(this.nightLightHDRFix);
    }

    async getWhiteLightState(): Promise<whiteLightBrightnessData> {

        const cmdUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=getWhiteLightBrightness&usr=${this.userName}&pwd=${this.password}`;
        const responseXml = await axios.get(cmdUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`getWhiteLightState: Error for ip: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`getWhiteLightState: ip: ${this.ipAddress} data: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                const enable = parseInt(xpath.select('//CGI_Result/enable[1]/text()', doc).valueOf().toString(), 10);
                const brightness = parseInt(xpath.select('//CGI_Result/brightness[1]/text()', doc).valueOf().toString());
                const lightinterval = parseInt(xpath.select('//CGI_Result/lightinterval[1]/text()', doc).valueOf().toString());

                return [resultCode, enable, brightness, lightinterval];
            }
            return [resultCode, null, null, null]
        }

        return null;
    }

    async setWhiteLightState(enable: boolean): Promise<boolean> {
        const commandMode = enable ? 1 : 0

        const setWhiteLightBrightnessUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=setWhiteLightBrightness&enable=${commandMode}&brightness=${this.brightness}&lightinterval=${this.lightinterval}&usr=${this.userName}&pwd=${this.password}`;

        const responseXml = await axios.get(setWhiteLightBrightnessUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`setWhiteLightState: Error for ip: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`setWhiteLightState: ip: ${this.ipAddress} data: \n${responseXml}`);
        }

        return false;

    }

    async getHdrMode(): Promise<hdrModeData> {

        const cmdUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=getHdrMode&usr=${this.userName}&pwd=${this.password}`;
        const responseXml = await axios.get(cmdUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`getHdrMode: Error for ip: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`getHdrMode: ip: ${this.ipAddress} data: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                const mode = parseInt(xpath.select('//CGI_Result/mode[1]/text()', doc).valueOf().toString(), 10);
                
                return [resultCode, mode];
            }
            return [resultCode, null]
        }

        return null;
    }

    async setHdrMode(enable: boolean): Promise<boolean> {
        const commandMode = enable ? 1 : 0

        const setHdrModeUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=setHdrMode&mode=${commandMode}}&usr=${this.userName}&pwd=${this.password}`;

        const responseXml = await axios.get(setHdrModeUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`setHdrMode: Error for ip: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`setHdrMode: ip: ${this.ipAddress} data: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                return true;
            }
        }

        return false;
    }

    async getDevState(): Promise<devStateData> {

        const cmdUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=getDevState&usr=${this.userName}&pwd=${this.password}`;
        const responseXml = await axios.get(cmdUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`getDevState: Error for ip: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            // this.console.log(`getDevState: ip: ${this.ipAddress} data: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                const infraLedState = parseInt(xpath.select('//CGI_Result/infraLedState[1]/text()', doc).valueOf().toString(), 10);
                
                return [resultCode, infraLedState];
            }
            return [resultCode, null]
        }

        return null;
    }

    async turnOff() {
        this.console.log('turnOff: sending whiteLight turn off request.');
        if (await this.setWhiteLightState(false)) {
            this.on = false
        }
    }

    async turnOn() {
        // set a breakpoint here.
        this.console.log('turnOn: sending whiteLight turn on request.');
        if (await this.setWhiteLightState(true)) {
            this.on = true
        }
    }

    async setBrightness(brightness: number): Promise<void> {
        this.console.log(`setBrightness: setting brightness to ${brightness}`);
        this.brightness = brightness
        this.setWhiteLightState(brightness > 0 ? true : false)
    }
}

class FoscamFloodlightDeviceProvider extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator {
    devices = new Map<string, FoscamFloodlightDevice>();

    constructor(nativeId?: string) {
        super(nativeId);

        for (const floodlightId of deviceManager.getNativeIds()) {
            if (floodlightId)
                this.getDevice(floodlightId);
        }

    }

    async getCreateDeviceSettings(): Promise<Setting[]> {
        return [
            {
                key: 'name',
                title: 'Floodlight Name',
                placeholder: 'Floodlight',
            },
        ];
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        // generate a random id
        const nativeId = 'foscamfl:' + randomBytes(8).toString('hex');
        const name = settings.name?.toString();

        await this.onDiscovered(nativeId, name);

        return nativeId;
    }

    async onDiscovered(nativeId: string, name: string) {
        await deviceManager.onDeviceDiscovered({
            nativeId,
            name,
            interfaces: [
                ScryptedInterface.OnOff,
                ScryptedInterface.Brightness,
                ScryptedInterface.Settings,
            ],
            type: ScryptedDeviceType.Light,
        });
    }

    getDevice(nativeId: string) {
        let ret = this.devices.get(nativeId);
        if (!ret) {
            ret = new FoscamFloodlightDevice(nativeId);

            if (ret)
                this.devices.set(nativeId, ret);
        }
        return ret;
    }
}

export default new FoscamFloodlightDeviceProvider();
