'use strict';

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
export default class UsdRubExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.usd-rub');

        this._indicator = null;
        this._label = null;
        this._session = null;
        this._timeoutId = null;
        this._settingsChangedId = null;

        this._createIndicator();
        this._placeIndicator();
        this._updateRate();

        this._settingsChangedId = this._settings.connect('changed::position', () => {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
                this._label = null;
            }
            this._createIndicator();
            this._placeIndicator();
            this._updateRate();
        });
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._label) {
            this._label.destroy();
            this._label = null;
        }

        if (this._session) {
            this._session.abort();
            this._session = null;
        }

        this._settings = null;
    }

    _createIndicator() {
        this._indicator = new PanelMenu.Button(0.0, 'USD-RUB Indicator', false);

        this._label = new St.Label({
            style_class: 'cPanelText',
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._indicator.add_child(this._label);
    }

    _placeIndicator() {
        const pos = this._settings.get_string('position');

        if (this._indicator.container && this._indicator.container.get_parent()) {
            this._indicator.container.get_parent().remove_child(this._indicator.container);
        }

        switch (pos) {
            case 'right-of-clock': {
                const dateMenu = Main.panel.statusArea?.dateMenu;
                const centerBox = Main.panel._centerBox;
                if (dateMenu?.container && centerBox) {
                    const children = centerBox.get_children();
                    const idx = children.indexOf(dateMenu.container);
                    const targetIdx = idx >= 0 ? idx + 1 : -1;
                    if (targetIdx >= 0) {
                        centerBox.insert_child_at_index(this._indicator.container, targetIdx);
                    } else {
                        centerBox.add_child(this._indicator.container);
                    }
                    return;
                }
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left-of-clock': {
                const dateMenu = Main.panel.statusArea?.dateMenu;
                const centerBox = Main.panel._centerBox;
                if (dateMenu?.container && centerBox) {
                    const children = centerBox.get_children();
                    const idx = children.indexOf(dateMenu.container);
                    const targetIdx = idx >= 0 ? idx : 0;
                    centerBox.insert_child_at_index(this._indicator.container, targetIdx);
                    return;
                }
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left':
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'left');
                return;
            case 'right':
            default:
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'right');
                return;
        }
    }

    _scheduleNextUpdate(interval) {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._updateRate();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _updateRate() {
        try {
            if (!this._session) {
                this._session = new Soup.Session({
                    timeout: 15,
                    user_agent: 'usd-rub-gnome-extension/1.0',
                });
            }

            const fetchJson = async (url) => {
                const msg = Soup.Message.new('GET', url);
                msg.request_headers.append('Accept', 'application/json');
                const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                if (msg.get_status() !== 200) {
                    throw new Error(`HTTP ${msg.get_status()}`);
                }
                const body = new TextDecoder().decode(bytes.get_data());
                return JSON.parse(body);
            };

            const providers = [
                async () => {
                    const j = await fetchJson('https://api.exchangerate.host/latest?base=USD&symbols=RUB');
                    if (!j?.rates?.RUB) {
                        throw new Error('Invalid response from exchangerate.host');
                    }
                    return Number(j.rates.RUB);
                },
                async () => {
                    const j = await fetchJson('https://open.er-api.com/v6/latest/USD');
                    if (!j?.rates?.RUB) {
                        throw new Error('Invalid response from er-api');
                    }
                    return Number(j.rates.RUB);
                },
                async () => {
                    const j = await fetchJson('https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/usd/rub.json');
                    const v = j?.rub ?? j?.RUB;
                    if (typeof v === 'undefined') {
                        throw new Error('Invalid response from fawazahmed currency api');
                    }
                    return Number(v);
                },
            ];

            let rub = NaN;
            let lastErr = null;
            for (const provider of providers) {
                try {
                    rub = await provider();
                    if (!isNaN(rub) && rub > 0) break;
                } catch (e) {
                    lastErr = e;
                    console.warn(`usd-rub: Provider failed: ${e.message}`);
                }
            }

            if (isNaN(rub) || rub <= 0) {
                throw lastErr || new Error('All providers failed');
            }

            const rate = rub.toFixed(2).replace('.', ',');
            if (this._label) {
                this._label.text = `USD = ${rate} RUB`;
            }
            this._scheduleNextUpdate(300);
        } catch (e) {
            console.error(`usd-rub: Update error: ${e.message}`);
            if (this._label) {
                this._label.text = '?';
            }
            this._scheduleNextUpdate(30);
        }
    }
}