'use strict';

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const SCHEMA = 'org.gnome.shell.extensions.usd-rub';

function init() {
    // nothing
}

function buildPrefsWidget() {
    const settings = new Gio.Settings({ schema_id: SCHEMA });

    // main container
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });

    // label
    const label = new Gtk.Label({
        label: 'USD → RUB indicator position:',
        xalign: 0
    });
    box.append(label);

    // combo
    const combo = new Gtk.ComboBoxText();
    combo.append('right-of-clock', 'Right of clock');
    combo.append('left-of-clock', 'Left of clock');
    combo.append('right', 'Right side');
    combo.append('left', 'Left side');

    // set current from settings
    let pos = settings.get_string('position');
    // Older default value might include quotes — strip them
    if (pos && pos.length > 1 && pos[0] === "'" && pos[pos.length - 1] === "'") {
        pos = pos.slice(1, -1);
    }
    // If empty, use default 'right'
    if (!pos)
        pos = 'right';

    combo.set_active_id(pos);
    box.append(combo);

    // when user changes selection, write to settings
    combo.connect('changed', () => {
        const id = combo.get_active_id();
        if (id) {
            // store as plain string without extra quotes
            settings.set_string('position', id);
        }
    });

    // Expose widget to GNOME prefs system
    return box;
}

export { init, buildPrefsWidget };
