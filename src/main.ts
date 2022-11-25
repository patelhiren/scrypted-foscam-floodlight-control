import sdk, { DeviceProvider, DeviceCreator, Setting, DeviceCreatorSettings, Settings, SettingValue, OnOff, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Brightness } from '@scrypted/sdk';
import axios from 'axios';
import { Console } from 'console';
import { randomBytes } from "crypto";
import { DOMParserImpl as dom } from 'xmldom-ts';
import * as xpath from 'xpath-ts';

const { deviceManager } = sdk;


const FLOODLIGHT_IP_KEY: string = "floodlight-ip"
const FLOODLIGHT_USER_KEY: string = "floodlight-username"
const FLOODLIGHT_PASSWORD_KEY: string = "floodlight-password"
class FoscamFloodlightDevice extends ScryptedDeviceBase implements Settings, OnOff, Brightness {

    lightinterval: number = 60

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
        ];
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        if (key === FLOODLIGHT_IP_KEY
            || key === FLOODLIGHT_USER_KEY
            || key === FLOODLIGHT_PASSWORD_KEY) {
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

    async updateState() {
        if (this.ipAddress == null
            || this.userName == null
            || this.password == null) {
            this.on = this.on || false;
            return;
        }

        const cmdUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=getWhiteLightBrightness&usr=${this.userName}&pwd=${this.password}`;
        const responseXml = await axios.get(cmdUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`IP: ${this.ipAddress} getWhiteLightBrightness: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`IP: ${this.ipAddress} getWhiteLightBrightness: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                const enable = parseInt(xpath.select('//CGI_Result/enable[1]/text()', doc).valueOf().toString(), 10);
                const brightness = parseInt(xpath.select('//CGI_Result/brightness[1]/text()', doc).valueOf().toString());
                const lightinterval = parseInt(xpath.select('//CGI_Result/lightinterval[1]/text()', doc).valueOf().toString());

                this.brightness = brightness
                this.lightinterval = lightinterval

                this.on = (enable === 1)
                return;
            }
        }

        this.on = this.on || false;

    }

    async setWhiteLightState(enable: boolean): Promise<boolean>  {
        const commandMode = enable ? 1: 0

        const setWhiteLightBrightnessUrl = `http://${this.ipAddress}/cgi-bin/CGIProxy.fcgi?cmd=setWhiteLightBrightness&enable=${commandMode}&brightness=${this.brightness}&lightinterval=${this.lightinterval}&usr=${this.userName}&pwd=${this.password}`;

        const responseXml = await axios.get(setWhiteLightBrightnessUrl, {
            responseType: 'text'
        }).then(response => {
            return response.data;
        }).catch(err => {
            console.log(`setWhiteLightState: Error for IP: ${this.ipAddress} error: \n${err}`);
        });

        if (responseXml != null) {
            this.console.log(`IP: ${this.ipAddress} setWhiteLightBrightness: \n${responseXml}`);
            const doc = new dom().parseFromString(responseXml);
            const resultCode = parseInt(xpath.select('//CGI_Result/result[1]/text()', doc).toString(), 10);
            if (resultCode == 0) {
                return true;
            }
        }

        return false;

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
