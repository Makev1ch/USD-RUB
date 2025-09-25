'use strict';

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export default class CurrencyExtension {
    constructor() {
        this._indicator = null;
        this._label = null;
        this._session = null;
        this._timeoutId = null;
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.usd-rub');
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
            this._session ??= new Soup.Session({ timeout: 10 });
            const message = Soup.Message.new(
                'GET',
                'https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=rub'
            );

            const bytes = await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null
            );

            const { usd: { rub } } = JSON.parse(new TextDecoder().decode(bytes.get_data()));
            const rate = parseFloat(rub).toFixed(2).replace('.', ',');

            this._label.text = `USD = ${rate} RUB`;
            this._scheduleNextUpdate(300);
        } catch (e) {
            console.error(`Error: ${e.message}`);
            this._label.text = '?';
            this._scheduleNextUpdate(7);
        }
    }

    _placeIndicator() {
        const pos = this._settings.get_string('position');

        switch (pos) {
            case 'right-of-clock': {
                const dateMenu = Main.panel.statusArea.dateMenu;
                Main.panel._centerBox.insert_child_above(this._indicator, dateMenu.container);
                break;
            }
            case 'left-of-clock': {
                const dateMenu = Main.panel.statusArea.dateMenu;
                Main.panel._centerBox.insert_child_below(this._indicator, dateMenu.container);
                break;
            }
            case 'left':
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 0, 'left');
                break;
            case 'right':
            default:
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'right');
                break;
        }
    }

    enable() {
        this._indicator = new PanelMenu.Button(0.0, 'USD-RUB Indicator', false);

        this._label = new St.Label({
            style_class: 'cPanelText',
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._indicator.add_child(this._label);

        this._placeIndicator();
        this._updateRate();

        // слушаем изменения настроек
        this._settingsChangedId = this._settings.connect('changed::position', () => {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
            }
            this.enable(); // пересоздать индикатор
        });
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._session) {
            this._session = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._label = null;
    }
}
