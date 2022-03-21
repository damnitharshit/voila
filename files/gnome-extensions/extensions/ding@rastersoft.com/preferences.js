/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

imports.gi.versions.Gtk = '3.0';

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const GioSSS = Gio.SettingsSchemaSource;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Enums = imports.enums;

const Gettext = imports.gettext;

var _ = Gettext.domain('ding').gettext;

var extensionPath;

var nautilusSettings;
var gtkSettings;
var desktopSettings;
var mutterSettings = null;
// This is already in Nautilus settings, so it should not be made tweakable here
var CLICK_POLICY_SINGLE = false;

function init(path) {
    extensionPath = path;
    let schemaSource = GioSSS.get_default();
    let schemaGtk = schemaSource.lookup(Enums.SCHEMA_GTK, true);
    gtkSettings = new Gio.Settings({ settings_schema: schemaGtk });
    let schemaObj = schemaSource.lookup(Enums.SCHEMA_NAUTILUS, true);
    if (!schemaObj) {
        nautilusSettings = null;
    } else {
        nautilusSettings = new Gio.Settings({ settings_schema: schemaObj });;
        nautilusSettings.connect('changed', _onNautilusSettingsChanged);
        _onNautilusSettingsChanged();
    }
    desktopSettings = get_schema(Enums.SCHEMA);
    let schemaMutter = schemaSource.lookup(Enums.SCHEMA_MUTTER, true);
    if (schemaMutter) {
        mutterSettings = new Gio.Settings({ settings_schema: schemaMutter});
    }
}

function get_schema(schema) {

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaSource;
    let schemaFile = Gio.File.new_for_path(GLib.build_filenamev([extensionPath, 'schemas', 'gschemas.compiled']));
    if (schemaFile.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(GLib.build_filenamev([extensionPath, 'schemas']), GioSSS.get_default(), false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension ' + '. Please check your installation.');

    return new Gio.Settings({ settings_schema: schemaObj });
}

function showPreferences() {
    if (this.window) {
        return;
    }
    this.window = new Gtk.Window({ resizable: false,
                                  window_position: Gtk.WindowPosition.CENTER });
    this.window.connect('destroy', () => {this.window = null});
    this.window.set_title(_("Settings"));
    DesktopIconsUtil.windowHidePagerTaskbarModal(this.window, true);
    let frame = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    this.window.add(frame);
    frame.set_spacing(10);
    frame.set_border_width(10);

    frame.add(buildSelector(desktopSettings, 'icon-size', _("Size for the desktop icons"), {'tiny': _("Tiny"), 'small': _("Small"), 'standard': _("Standard"), 'large': _("Large") }));
    frame.add(buildSwitcher(desktopSettings, 'show-home', _("Show the personal folder in the desktop")));
    frame.add(buildSwitcher(desktopSettings, 'show-trash', _("Show the trash icon in the desktop")));
    frame.add(buildSwitcher(desktopSettings, 'show-volumes', _("Show external drives in the desktop")));
    frame.add(buildSwitcher(desktopSettings, 'show-network-volumes', _("Show network drives in the desktop")));
    frame.add(buildSelector(desktopSettings,
                            'start-corner',
                            _("New icons alignment"),
                            {'top-left': _("Top-left corner"),
                             'top-right': _("Top-right corner"),
                             'bottom-left': _("Bottom-left corner"),
                             'bottom-right': _("Bottom-right corner")
                            }));
    frame.add(buildSwitcher(desktopSettings, 'add-volumes-opposite', _("Add new drives to the opposite side of the screen")));
    frame.add(buildSwitcher(desktopSettings, 'show-drop-place', _("Highlight the drop place during Drag'n'Drop")));
    frame.add(buildSwitcher(desktopSettings, 'use-nemo', _("Use Nemo to open folders")));

    frame.add(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }));

    let nautilusFrame = new Gtk.Frame({ label: _("Settings shared with Nautilus"),
                                        shadow_type: Gtk.ShadowType.ETCHED_IN });
    let nautilusBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: 5, spacing: 10});
    nautilusFrame.add(nautilusBox);
    frame.add(nautilusFrame);

    nautilusBox.add(buildSelector(nautilusSettings, 'click-policy', _("Click type for open files"), { 'single': _("Single click"), 'double': _("Double click"), }));
    nautilusBox.add(buildSwitcher(gtkSettings, 'show-hidden', _("Show hidden files")));
    nautilusBox.add(buildSwitcher(nautilusSettings, 'show-delete-permanently', _("Show a context menu item to delete permanently")));
    // Gnome Shell 40 removed this option
    try {
        nautilusBox.add(buildSelector(nautilusSettings,
                                      'executable-text-activation',
                                      _("Action to do when launching a program from the desktop"), {
                                          'display': _("Display the content of the file"),
                                          'launch': _("Launch the file"),
                                          'ask': _("Ask what to do")
                                       }));
    } catch(e) {
    }
    nautilusBox.add(buildSelector(nautilusSettings,
                                  'show-image-thumbnails',
                                  _("Show image thumbnails"), {
                                      'never': _("Never"),
                                      'local-only': _("Local files only"),
                                      'always': _("Always")
                                   }));
    this.window.show_all();
}

function buildSwitcher(settings, key, labelText) {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
    let label = new Gtk.Label({ label: labelText, xalign: 0 });
    let switcher = new Gtk.Switch({ active: settings.get_boolean(key) });
    settings.bind(key, switcher, 'active', 3);
    hbox.pack_start(label, true, true, 0);
    hbox.add(switcher);
    return hbox;
}

function buildSelector(settings, key, labelText, elements) {
    let listStore = new Gtk.ListStore();
    listStore.set_column_types ([GObject.TYPE_STRING, GObject.TYPE_STRING]);
    let schemaKey = settings.settings_schema.get_key(key);
    let values = schemaKey.get_range().get_child_value(1).get_child_value(0).get_strv();
    for (let val of values) {
        let iter = listStore.append();
        let visibleText = val;
        if (visibleText in elements)
            visibleText = elements[visibleText];
        listStore.set (iter, [0, 1], [visibleText, val]);
    }
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
    let label = new Gtk.Label({ label: labelText, xalign: 0 });
    let combo = new Gtk.ComboBox({model: listStore});
    let rendererText = new Gtk.CellRendererText();
    combo.pack_start (rendererText, false);
    combo.add_attribute (rendererText, 'text', 0);
    combo.set_id_column(1);
    settings.bind(key, combo, 'active-id', 3);
    hbox.pack_start(label, true, true, 0);
    hbox.add(combo);
    return hbox;
}

function _onNautilusSettingsChanged() {
    CLICK_POLICY_SINGLE = nautilusSettings.get_string('click-policy') == 'single';
}

function get_icon_size() {
    return Enums.ICON_SIZE[desktopSettings.get_string('icon-size')];
}

function get_desired_width() {
    return Enums.ICON_WIDTH[desktopSettings.get_string('icon-size')];
}

function get_desired_height() {
    return Enums.ICON_HEIGHT[desktopSettings.get_string('icon-size')];
}

function get_start_corner() {
    return Enums.START_CORNER[desktopSettings.get_string('start-corner')].slice();
}

function getSortOrder() {
    return Enums.SortOrder[desktopSettings.get_string(Enums.SortOrder.ORDER)];
}

function setSortOrder(order) {
    let x = Object.values(Enums.SortOrder).indexOf(order);
    desktopSettings.set_enum(Enums.SortOrder.ORDER, x);
}

function getUnstackList() {
    return desktopSettings.get_strv('unstackedtypes');
}

function setUnstackList(array) {
    desktopSettings.set_strv('unstackedtypes', array);
}
