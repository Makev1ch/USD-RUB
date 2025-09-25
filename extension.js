'use strict';

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export default class CurrencyExtension {
    constructor() {
        // Short form: ExtensionUtils.getSettings() will read settings-schema from metadata.json
        this._settings = ExtensionUtils.getSettings();

        this._indicator = null;
        this._label = null;
        this._session = null;
        this._timeoutId = null;
        this._settingsChangedId = null;
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

        // Remove if already added somewhere (we ensure indicator not added twice by destroying and recreating in enable)
        switch (pos) {
            case 'right-of-clock': {
                const dateMenu = Main.panel.statusArea && Main.panel.statusArea.dateMenu;
                if (dateMenu && dateMenu.container) {
                    // insert above (to the right of) clock
                    Main.panel._centerBox.insert_child_above(this._indicator, dateMenu.container);
                    return;
                }
                // fallback
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left-of-clock': {
                const dateMenu = Main.panel.statusArea && Main.panel.statusArea.dateMenu;
                if (dateMenu && dateMenu.container) {
                    // insert below (to the left of) clock
                    Main.panel._centerBox.insert_child_below(this._indicator, dateMenu.container);
                    return;
                }
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left':
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 0, 'left');
                return;
            case 'right':
            default:
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'right');
                return;
        }
    }

    _scheduleNextUpdate(interval) {
        if (this._timeoutId) {
            try { GLib.Source.remove(this._timeoutId); } catch (e) {}
            this._timeoutId = null;
        }
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._updateRate();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _updateRate() {
        try {
            // ensure session exists
            if (!this._session)
                this._session = new Soup.Session({ timeout: 10 });

            const message = Soup.Message.new(
                'GET',
                'https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=rub'
            );

            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            const body = new TextDecoder().decode(bytes.get_data());
            const parsed = JSON.parse(body);

            if (!parsed.usd || typeof parsed.usd.rub === 'undefined') {
                throw new Error('unexpected response');
            }

            const rub = parseFloat(parsed.usd.rub);
            const rate = isNaN(rub) ? '?' : rub.toFixed(2).replace('.', ',');

            if (this._label)
                this._label.text = `USD = ${rate} RUB`;

            // next update in 5 minutes
            this._scheduleNextUpdate(300);
        } catch (e) {
            log(`usd-rub: update error: ${e.message}`);
            if (this._label)
                this._label.text = '?';
            // retry quickly
            this._scheduleNextUpdate(7);
        }
    }

    enable() {
        // Create indicator and place depending on settings
        this._createIndicator();
        this._placeIndicator();

        // start updates
        this._updateRate();

        // Listen for settings change (position)
        this._settingsChangedId = this._settings.connect('changed::position', () => {
            // destroy and recreate indicator at new position
            if (this._indicator) {
                try { this._indicator.destroy(); } catch (e) {}
                this._indicator = null;
                this._label = null;
            }

            this._createIndicator();
            this._placeIndicator();
            // update text immediately
            this._updateRate();
        });
    }

    disable() {
        if (this._settingsChangedId) {
            try { this._settings.disconnect(this._settingsChangedId); } catch (e) {}
            this._settingsChangedId = null;
        }

        if (this._timeoutId) {
            try { GLib.Source.remove(this._timeoutId); } catch (e) {}
            this._timeoutId = null;
        }

        if (this._indicator) {
            try { this._indicator.destroy(); } catch (e) {}
            this._indicator = null;
        }

        this._label = null;

        // clear session (no abort method)
        this._session = null;
    }
}
