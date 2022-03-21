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

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Config = imports.misc.config;
const ByteArray = imports.byteArray;

const Me = ExtensionUtils.getCurrentExtension();
const EmulateX11 = Me.imports.emulateX11WindowType;
const VisibleArea = Me.imports.visibleArea;
const GnomeShellOverride = Me.imports.gnomeShellOverride;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

// This object will contain all the global variables
let data = {};

var DesktopIconsUsableArea = null;

function init() {
    data.isEnabled = false;
    data.launchDesktopId = 0;
    data.currentProcess = null;
    data.reloadTime = 100;

    data.GnomeShellOverride = null;
    data.GnomeShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[0]);

    /* The constructor of the EmulateX11 class only initializes some
     * internal properties, but nothing else. In fact, it has its own
     * enable() and disable() methods. That's why it could have been
     * created here, in init(). But since the rule seems to be NO CLASS
     * CREATION IN INIT UNDER NO CIRCUMSTANCES...
     */
    data.x11Manager = null;
    data.visibleArea = null;

    /* Ensures that there aren't "rogue" processes.
     * This is a safeguard measure for the case of Gnome Shell being
     * relaunched (for example, under X11, with Alt+F2 and R), to kill
     * any old DING instance. That's why it must be here, in init(),
     * and not in enable() or disable() (disable already guarantees that
     * the current instance is killed).
     */
    doKillAllOldDesktopProcesses();
}


/**
 * Enables the extension
 */
function enable() {
    if (!data.GnomeShellOverride) {
        data.GnomeShellOverride = new GnomeShellOverride.GnomeShellOverride();
    }

    if (!data.x11Manager) {
        data.x11Manager = new EmulateX11.EmulateX11WindowType();
    }
    if (!DesktopIconsUsableArea) {
        DesktopIconsUsableArea = new VisibleArea.VisibleArea();
        data.visibleArea = DesktopIconsUsableArea;
    }
    // If the desktop is still starting up, we wait until it is ready
    if (Main.layoutManager._startingUp) {
        data.startupPreparedId = Main.layoutManager.connect('startup-complete', () => { innerEnable(true); });
    } else {
        innerEnable(false);
    }
}

/**
 * The true code that configures everything and launches the desktop program
 */
function innerEnable(removeId) {

    if (removeId) {
        Main.layoutManager.disconnect(data.startupPreparedId);
        data.startupPreparedId = null;
    }

    data.GnomeShellOverride.enable();

    // under X11 we don't need to cheat, so only do all this under wayland
    if (Meta.is_wayland_compositor()) {
        data.x11Manager.enable();
    }

    /*
     * If the desktop geometry changes (because a new monitor has been added, for example),
     * we kill the desktop program. It will be relaunched automatically with the new geometry,
     * thus adapting to it on-the-fly.
     */
    data.monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
        reloadIfSizesChanged();
    });
    /*
     * Any change in the workareas must be detected too, for example if the used size
     * changes.
     */
    data.workareasChangedId = global.display.connect('workareas-changed', () => {
        reloadIfSizesChanged();
    });

    /*
     * This callback allows to detect a change in the working area (like when changing the Scale value)
     */
    data.sizeChangedId = global.window_manager.connect('size-changed', () => {
        reloadIfSizesChanged();
    });

    data.visibleAreaId = data.visibleArea.connect('updated-usable-area', () => {
        reloadIfSizesChanged();
    });

    data.isEnabled = true;
    if (data.launchDesktopId) {
        GLib.source_remove(data.launchDesktopId);
    }
    launchDesktop();
    data.remoteDingUpdate = Gio.DBusActionGroup.get(
        Gio.DBus.session,
        'com.rastersoft.ding',
        '/com/rastersoft/ding/updateGridWindows'
    );

    /*
     * Due to a problem in the Clipboard API in Gtk3, it is not possible to do the CUT/COPY operation from
     * dynamic languages like Javascript, because one of the methods needed is marked as NOT INTROSPECTABLE
     *
     * https://discourse.gnome.org/t/missing-gtk-clipboard-set-with-data-in-gtk-3/6920
     *
     * The right solution is to migrate DING to Gtk4, where the whole API is available, but that is a very
     * big task, so in the meantime, we take advantage of the fact that the St API, in Gnome Shell, can put
     * binary contents in the clipboard, so we use DBus to notify that we want to do a CUT or a COPY operation,
     * passing the URIs as parameters, and delegate that to the DING Gnome Shell extension. This is easily done
     * with a GLib.SimpleAction.
     */
    data.dbusConnectionId = Gio.bus_own_name(Gio.BusType.SESSION, "com.rastersoft.dingextension", Gio.BusNameOwnerFlags.NONE, null, (connection, name) => {
        data.dbusConnection = connection;

        let doCopy = new Gio.SimpleAction({
            name: 'doCopy',
            parameter_type: new GLib.VariantType('as')
        });
        let doCut = new Gio.SimpleAction({
            name: 'doCut',
            parameter_type: new GLib.VariantType('as')
        });
        doCopy.connect('activate', manageCutCopy);
        doCut.connect('activate', manageCutCopy);
        let actionGroup = new Gio.SimpleActionGroup();
        actionGroup.add_action(doCopy);
        actionGroup.add_action(doCut);

        this._dbusConnectionGroupId = data.dbusConnection.export_action_group(
            '/com/rastersoft/dingextension/control',
            actionGroup
        );
    }, null);
}

/*
 * Before Gnome Shell 40, St API couldn't access binary data in the clipboard, only text data. Also, the
 * original Desktop Icons was a pure extension, so it was limited to what Clutter and St offered. That was
 * the reason why Nautilus accepted a text format for CUT and COPY operations in the form
 *
 *     x-special/nautilus-clipboard
 *     OPERATION
 *     FILE_URI
 *     [FILE_URI]
 *     [...]
 *
 * In Gnome Shell 40, St was enhanced and now it supports binary data; that's why Nautilus migrated to a
 * binary format identified by the atom 'x-special/gnome-copied-files', where the CUT or COPY operation is
 * shared.
 *
 * To maintain compatibility, we check the current Gnome Shell version and, based on that, we use the
 * binary or the text clipboards.
 */
function manageCutCopy(action, parameters) {

    let content = "";
    if (data.GnomeShellVersion < 40) {
        content = 'x-special/nautilus-clipboard\n';
    }
    if (action.name == 'doCut') {
        content += 'cut\n';
    } else {
        content += 'copy\n';
    }

    let first = true;
    for (let file of parameters.recursiveUnpack()) {
        if (!first) {
            content += '\n';
        }
        first = false;
        content += file;
    }

    if (data.GnomeShellVersion < 40) {
        Clipboard.set_text(CLIPBOARD_TYPE, content + "\n");
    } else {
        Clipboard.set_content(CLIPBOARD_TYPE, 'x-special/gnome-copied-files', ByteArray.toGBytes(ByteArray.fromString(content)));
    }
}

/**
 * Disables the extension
 */
function disable() {

    DesktopIconsUsableArea = null;
    data.isEnabled = false;
    killCurrentProcess();
    data.GnomeShellOverride.disable();
    data.x11Manager.disable();
    data.visibleArea.disable();

    // disconnect signals only if connected
    if (this._dbusConnectionGroupId) {
        data.dbusConnection.unexport_action_group(this._dbusConnectionGroupId);
        this._dbusConnectionGroupId = 0;
    }

    if (data.dbusConnectionId) {
        Gio.bus_unown_name(data.dbusConnectionId);
        data.dbusConnectionId = 0;
    }
    if (data.visibleAreaId) {
        data.visibleArea.disconnect(data.visibleAreaId);
        data.visibleAreaId = 0;
    }
    if (data.startupPreparedId) {
        Main.layoutManager.disconnect(data.startupPreparedId);
        data.startupPreparedId = 0;
    }
    if (data.monitorsChangedId) {
        Main.layoutManager.disconnect(data.monitorsChangedId);
        data.monitorsChangedId = 0;
    }
    if (data.workareasChangedId) {
        global.display.disconnect(data.workareasChangedId);
        data.workareasChangedId = 0;
    }
    if (data.sizeChangedId) {
        global.window_manager.disconnect(data.sizeChangedId);
        data.sizeChangedId = 0;
    }
}

function reloadIfSizesChanged() {
    let desktopList = [];
    let ws = global.workspace_manager.get_workspace_by_index(0);
    for(let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
        let area = data.visibleArea.getMonitorGeometry(ws, monitorIndex);
        let desktopListElement = new GLib.Variant('a{sd}', {
            'x' : area.x,
            'y': area.y,
            'width' : area.width,
            'height' : area.height,
            'zoom' : area.scale,
            'marginTop' : area.marginTop,
            'marginBottom' : area.marginBottom,
            'marginLeft' : area.marginLeft,
            'marginRight' : area.marginRight,
            'monitorIndex' : monitorIndex
        });
        desktopList.push(desktopListElement);
    }
    let desktopListVariant = new GLib.Variant('av', desktopList);
    data.remoteDingUpdate.activate_action('updateGridWindows', desktopListVariant);
}

/**
 * Kills the current desktop program
 */
function killCurrentProcess() {
    // If a reload was pending, kill it and program a new reload
    if (data.launchDesktopId) {
        GLib.source_remove(data.launchDesktopId);
        data.launchDesktopId = 0;
        if (data.isEnabled) {
            data.launchDesktopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, data.reloadTime, () => {
                data.launchDesktopId = 0;
                launchDesktop();
                return false;
            });
        }
    }

    // kill the desktop program. It will be reloaded automatically.
    if (data.currentProcess && data.currentProcess.subprocess) {
        data.currentProcess.subprocess.send_signal(15);
    }
}

/**
 * This function checks all the processes in the system and kills those
 * that are a desktop manager from the current user (but not others).
 * This allows to avoid having several ones in case gnome shell resets,
 * or other odd cases. It requires the /proc virtual filesystem, but
 * doesn't fail if it doesn't exist.
 */

function doKillAllOldDesktopProcesses() {

    let procFolder = Gio.File.new_for_path('/proc');
    if (!procFolder.query_exists(null)) {
        return;
    }

    let fileEnum = procFolder.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = fileEnum.next_file(null))) {
        let filename = info.get_name();
        if (!filename) {
            break;
        }
        let processPath = GLib.build_filenamev(['/proc', filename, 'cmdline']);
        let processUser = Gio.File.new_for_path(processPath);
        if (!processUser.query_exists(null)) {
            continue;
        }
        let [binaryData, etag] = processUser.load_bytes(null);
        let contents = '';
        let readData = binaryData.get_data();
        for (let i = 0; i < readData.length; i++) {
            if (readData[i] < 32) {
                contents += ' ';
            } else {
                contents += String.fromCharCode(readData[i]);
            }
        }
        let path = 'gjs ' + GLib.build_filenamev([ExtensionUtils.getCurrentExtension().path, 'ding.js']);
        if (contents.startsWith(path)) {
            let proc = new Gio.Subprocess({argv: ['/bin/kill', filename]});
            proc.init(null);
            proc.wait(null);
        }
    }
}

/**
 * Launches the desktop program, passing to it the current desktop geometry for each monitor
 * and the path where it is stored. It also monitors it, to relaunch it in case it dies or is
 * killed. Finally, it reads STDOUT and STDERR and redirects them to the journal, to help to
 * debug it.
 */
function launchDesktop() {

    data.reloadTime = 100;
    let argv = [];
    argv.push(GLib.build_filenamev([ExtensionUtils.getCurrentExtension().path, 'ding.js']));
    // Specify that it must work as true desktop
    argv.push('-E');
    // The path. Allows the program to find translations, settings and modules.
    argv.push('-P');
    argv.push(ExtensionUtils.getCurrentExtension().path);

    let first = true;

    argv.push('-M');
    argv.push(`${Main.layoutManager.primaryIndex}`);

    let ws = global.workspace_manager.get_workspace_by_index(0);
    for(let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
        let area = data.visibleArea.getMonitorGeometry(ws, monitorIndex);
        // send the working area of each monitor in the desktop
        argv.push('-D');
        argv.push(`${area.x}:${area.y}:${area.width}:${area.height}:${area.scale}:${area.marginTop}:${area.marginBottom}:${area.marginLeft}:${area.marginRight}:${monitorIndex}`);
        if (first || (area.x < data.minx)) {
            data.minx = area.x;
        }
        if (first || (area.y < data.miny)) {
            data.miny = area.y;
        }
        if (first || ((area.x + area.width) > data.maxx)) {
            data.maxx = area.x + area.width;
        }
        if (first || ((area.y + area.height) > data.maxy)) {
            data.maxy = area.y + area.height;
        }
        first = false;
    }

    data.currentProcess = new LaunchSubprocess(0, "DING", "-U");
    data.currentProcess.set_cwd(GLib.get_home_dir());
    data.currentProcess.spawnv(argv);
    data.x11Manager.set_wayland_client(data.currentProcess);

    /*
     * If the desktop process dies, wait 100ms and relaunch it, unless the exit status is different than
     * zero, in which case it will wait one second. This is done this way to avoid relaunching the desktop
     * too fast if it has a bug that makes it fail continuously, avoiding filling the journal too fast.
     */
    data.currentProcess.subprocess.wait_async(null, (obj, res) => {
        let b = obj.wait_finish(res);
        if (!data.currentProcess || obj !== data.currentProcess.subprocess) {
            return;
        }
        if (obj.get_if_exited()) {
            let retval = obj.get_exit_status();
            if (retval != 0) {
                data.reloadTime = 1000;
            }
        } else {
            data.reloadTime = 1000;
        }
        data.currentProcess = null;
        data.x11Manager.set_wayland_client(null);
        if (data.isEnabled) {
            if (data.launchDesktopId) {
                GLib.source_remove(data.launchDesktopId);
            }
            data.launchDesktopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, data.reloadTime, () => {
                data.launchDesktopId = 0;
                launchDesktop();
                return false;
            });
        }
    });
}

/**
 * This class encapsulates the code to launch a subprocess that can detect whether a window belongs to it
 * It only accepts to do it under Wayland, because under X11 there is no need to do these tricks
 *
 * It is compatible with https://gitlab.gnome.org/GNOME/mutter/merge_requests/754 to simplify the code
 *
 * @param {int} flags Flags for the SubprocessLauncher class
 * @param {string} process_id An string id for the debug output
 * @param {string} cmd_parameter A command line parameter to pass when running. It will be passed only under Wayland,
 *                               so, if this parameter isn't passed, the app can assume that it is running under X11.
 */
var LaunchSubprocess = class {

    constructor(flags, process_id, cmd_parameter) {
        this._process_id = process_id;
        this._cmd_parameter = cmd_parameter;
        this._UUID = null;
        this._flags = flags | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE;
        this._launcher = new Gio.SubprocessLauncher({flags: this._flags});
        if (Meta.is_wayland_compositor()) {
            this._waylandClient = Meta.WaylandClient.new(this._launcher);
            if (Config.PACKAGE_VERSION == '3.38.0') {
                // workaround for bug in 3.38.0
                this._launcher.ref();
            }
        }
        this.subprocess = null;
        this.process_running = false;
    }

    spawnv(argv) {
        if (Meta.is_wayland_compositor()) {
            this.subprocess = this._waylandClient.spawnv(global.display, argv);
        } else {
            this.subprocess = this._launcher.spawnv(argv);
        }
        // This is for GLib 2.68 or greater
        if (this._launcher.close) {
            this._launcher.close();
        }
        this._launcher = null;
        if (this.subprocess) {
                /*
                 * It reads STDOUT and STDERR and sends it to the journal using global.log(). This allows to
                 * have any error from the desktop app in the same journal than other extensions. Every line from
                 * the desktop program is prepended with the "process_id" parameter sent in the constructor.
                 */
            this.subprocess.communicate_utf8_async(null, null, (object, res) => {
                try {
                    let [d, stdout, stderr] = object.communicate_utf8_finish(res);
                    if (stdout.length != 0) {
                        global.log(`${this._process_id}: ${stdout}`);
                    }
                } catch(e) {
                    global.log(`${this._process_id}_Error: ${e}`);
                }
            });
            this.subprocess.wait_async(null, () => {
                this.process_running = false;
            });
            this.process_running = true;
        }
        return this.subprocess;
    }

    set_cwd(cwd) {
        this._launcher.set_cwd (cwd);
    }

    /**
     * Queries whether the passed window belongs to the launched subprocess or not.
     * @param {MetaWindow} window The window to check.
     */
    query_window_belongs_to (window) {
        if (!Meta.is_wayland_compositor()) {
            return false;
        }
        if (!this.process_running) {
            return false;
        }
        try {
            return (this._waylandClient.owns_window(window));
        } catch(e) {
            return false;
        }
    }

    show_in_window_list(window) {
        if (Meta.is_wayland_compositor() && this.process_running) {
            this._waylandClient.show_in_window_list(window);
        }
    }

    hide_from_window_list(window) {
        if (Meta.is_wayland_compositor() && this.process_running) {
            this._waylandClient.hide_from_window_list(window);
        }
    }
}
