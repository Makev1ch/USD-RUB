'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCHEMA = 'org.gnome.shell.extensions.usd-rub';

export default class UsdRubPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(520, 260);

        // Get settings using the helper method
        const settings = this.getSettings(SCHEMA);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ 
            title: 'Display Settings',
            description: 'Configure where the USD/RUB indicator appears on the panel'
        });
        page.add(group);

        const labels = [
            'Right of clock',
            'Left of clock', 
            'Right side of panel',
            'Left side of panel',
        ];
        const values = ['right-of-clock', 'left-of-clock', 'right', 'left'];

        const model = Gtk.StringList.new(labels);
        const row = new Adw.ComboRow({ 
            title: 'Indicator Position',
            model,
            subtitle: 'Choose where to display the exchange rate indicator'
        });

        // Get current position setting
        const current = settings.get_string('position') || 'right';
        const currentIndex = values.indexOf(current);
        row.set_selected(currentIndex >= 0 ? currentIndex : 2); // Default to 'right'

        // Connect to changes
        row.connect('notify::selected', () => {
            const selected = row.get_selected();
            if (selected >= 0 && selected < values.length) {
                settings.set_string('position', values[selected]);
            }
        });

        group.add(row);
        window.add(page);
    }
}