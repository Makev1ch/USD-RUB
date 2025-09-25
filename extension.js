'use strict';

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class CurrencyExtension {
    constructor() {
        this._indicator = null;
        this._label = null;
        this._session = null;
        this._timeoutId = null;
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

    enable() {
        // создаём кнопку-индикатор
        this._indicator = new PanelMenu.Button(0.0, 'USD-RUB Indicator', false);

        // текстовое поле
        this._label = new St.Label({
            style_class: 'cPanelText',
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._indicator.add_child(this._label);

        // добавляем в панель
        Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');

        // запускаем обновление
        this._updateRate();
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._label = null;

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._session = null;
    }
}
