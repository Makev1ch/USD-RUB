'use strict';

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export default class CurrencyExtension {
    constructor() {
        // Инициализируем настройки из локальной схемы расширения
        const SCHEMA_ID = 'org.gnome.shell.extensions.usd-rub';
        let settings = null;
        try {
            if (ExtensionUtils && ExtensionUtils.getSettings)
                settings = ExtensionUtils.getSettings(SCHEMA_ID);
        } catch (_) {}

        if (!settings) {
            try {
                const thisFile = Gio.File.new_for_uri(import.meta.url);
                const extDir = thisFile.get_parent();
                const schemaDir = extDir && extDir.get_child('schemas');
                const schemaPath = schemaDir && schemaDir.get_path();
                if (schemaPath) {
                    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                        schemaPath,
                        Gio.SettingsSchemaSource.get_default(),
                        false
                    );
                    const schema = schemaSource.lookup(SCHEMA_ID, true);
                    if (schema)
                        settings = new Gio.Settings({ settings_schema: schema });
                }
            } catch (_) {}
        }

        if (!settings)
            settings = new Gio.Settings({ schema_id: SCHEMA_ID });

        // Если и это не удалось, то лучше выбросить ошибку, чем молча игнорировать
        if (!settings)
            throw new Error('usd-rub: cannot initialize GSettings');

        this._settings = settings;

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
                const centerBox = Main.panel._centerBox;
                if (dateMenu && dateMenu.container && centerBox) {
                    const children = centerBox.get_children();
                    const idx = children.indexOf(dateMenu.container);
                    const targetIdx = idx >= 0 ? idx + 1 : -1;
                    if (targetIdx >= 0)
                        centerBox.insert_child_at_index(this._indicator.container ?? this._indicator, targetIdx);
                    else
                        centerBox.add_child(this._indicator.container ?? this._indicator);
                    return;
                }
                // fallback
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left-of-clock': {
                const dateMenu = Main.panel.statusArea && Main.panel.statusArea.dateMenu;
                const centerBox = Main.panel._centerBox;
                if (dateMenu && dateMenu.container && centerBox) {
                    const children = centerBox.get_children();
                    const idx = children.indexOf(dateMenu.container);
                    const targetIdx = idx >= 0 ? idx : 0;
                    centerBox.insert_child_at_index(this._indicator.container ?? this._indicator, targetIdx);
                    return;
                }
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'center');
                return;
            }
            case 'left':
                // Добавляем на левую сторону после системных навигационных элементов
                // Ищем левый бокс и помещаем индикатор после первого ребенка (обычно Activities/Workspace)
                Main.panel.addToStatusArea('usd-rub-indicator', this._indicator, 1, 'left');
                try {
                    const parent = (this._indicator.container ?? this._indicator).get_parent();
                    if (parent && parent.insert_child_at_index) {
                        const children = parent.get_children();
                        const targetIdx = Math.min(children.length, 1);
                        parent.remove_child(this._indicator.container ?? this._indicator);
                        parent.insert_child_at_index(this._indicator.container ?? this._indicator, targetIdx);
                    }
                } catch (_) {}
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
                this._session = new Soup.Session({ timeout: 15, user_agent: 'usd-rub-gnome-extension/1.0' });
            
            const fetchJson = async (url) => {
                const msg = Soup.Message.new('GET', url);
                try { msg.request_headers.append('Accept', 'application/json'); } catch (_) {}
                const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
                // Soup3 exposes status via msg.get_status()
                if (typeof msg.get_status === 'function' && msg.get_status() !== 200)
                    throw new Error(`http ${msg.get_status()}`);
                const body = new TextDecoder().decode(bytes.get_data());
                return JSON.parse(body);
            };

            const providers = [
                async () => {
                    const j = await fetchJson('https://api.exchangerate.host/latest?base=USD&symbols=RUB');
                    if (!j || !j.rates || typeof j.rates.RUB === 'undefined')
                        throw new Error('bad exchangerate.host');
                    return Number(j.rates.RUB);
                },
                async () => {
                    const j = await fetchJson('https://open.er-api.com/v6/latest/USD');
                    if (!j || !j.rates || typeof j.rates.RUB === 'undefined')
                        throw new Error('bad er-api');
                    return Number(j.rates.RUB);
                },
                async () => {
                    const j = await fetchJson('https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/usd/rub.json');
                    const v = j && (j.rub ?? j.RUB);
                    if (typeof v === 'undefined')
                        throw new Error('bad fawazahmed currency api');
                    return Number(v);
                },
            ];

            let rub = NaN;
            let lastErr = null;
            for (const p of providers) {
                try {
                    rub = await p();
                    if (!isNaN(rub)) break;
                } catch (e) {
                    lastErr = e;
                }
            }
            if (isNaN(rub)) {
                throw lastErr || new Error('all providers failed');
            }
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
