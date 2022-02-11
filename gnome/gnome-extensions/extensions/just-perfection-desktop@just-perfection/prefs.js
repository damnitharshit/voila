/**
 * Prefs Dialog
 *
 * @author     Javad Rahmatzadeh <j.rahmatzadeh@gmail.com>
 * @copyright  2020-2022
 * @license    GNU General Public License v3.0
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Prefs} = Me.imports.lib;
const {Gtk, Gdk, Gio, GLib, GObject} = imports.gi;

const Config = imports.misc.config;
const shellVersion = parseFloat(Config.PACKAGE_VERSION);


/**
 * prefs initiation
 *
 * @returns {void}
 */
function init()
{
    ExtensionUtils.initTranslations();
}

/**
 * prefs widget
 *
 * @returns {Gtk.Widget}
 */
function buildPrefsWidget()
{
    let gettextDomain = Me.metadata['gettext-domain'];
    let UIFolderPath = Me.dir.get_child('ui').get_path();
    let binFolderPath = Me.dir.get_child('bin').get_path();

    let builder = new Gtk.Builder();
    let settings = ExtensionUtils.getSettings();
    let prefs = new Prefs.Prefs({
        Builder: builder,
        Settings: settings,
        GObjectBindingFlags: GObject.BindingFlags,
        Gtk,
        Gdk,
        Gio,
        GLib,
    }, shellVersion);

    return prefs.getMainPrefs(UIFolderPath, binFolderPath, gettextDomain);
}

