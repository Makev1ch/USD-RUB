'use strict';

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UsdRubPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(400, 200);

        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Indicator Settings' });

        const combo = new Adw.ComboRow({
            title: 'Position of indicator',
            model: Gio.ListStore.new(Adw.EnumListItem),
        });

        const options = [
            ['right-of-clock', 'Right of clock'],
            ['left-of-clock', 'Left of clock'],
            ['right', 'Right side'],
            ['left', 'Left side'],
        ];

        const store = new Gio.ListStore({ item_type: Adw.EnumListItem });
        for (let [value, label] of options) {
            store.append(new Adw.EnumListItem({ value, name: label }));
        }

        combo.model = store;

        // bind value
        settings.bind('position', combo, 'selected-item', Gio.SettingsBindFlags.DEFAULT);

        group.add(combo);
        page.add(group);
        window.add(page);
    }
}
