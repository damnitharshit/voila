#!/usr/bin/env gjs

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
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

let desktops = [];
let lastCommand = null;
let codePath = '.';
let errorFound = false;
let asDesktop = false;
let primaryIndex = 0;
let desktopVariants = [];
let remoteDingUpdate;

function parseCommandLine(argv) {
    desktops = [];
    for(let arg of argv) {
        if (lastCommand == null) {
            switch(arg) {
            case '-E':
                // run it as a true desktop (transparent window and so on)
                asDesktop = true;
                break;
            case '-P':
            case '-D':
            case '-M':
                lastCommand = arg;
                break;
            default:
                print(`Parameter ${arg} not recognized. Aborting.`);
                errorFound = true;
                break;
            }
            continue;
        }
        if (errorFound) {
            break;
        }
        switch(lastCommand) {
        case '-P':
            codePath = arg;
            break;
        case '-D':
            let data = arg.split(":");
            desktops.push({
                x:parseInt(data[0]),
                y:parseInt(data[1]),
                width:parseInt(data[2]),
                height:parseInt(data[3]),
                zoom:parseFloat(data[4]),
                marginTop:parseInt(data[5]),
                marginBottom:parseInt(data[6]),
                marginLeft:parseInt(data[7]),
                marginRight:parseInt(data[8]),
                monitorIndex:parseInt(data[9])
            });
            let datavariant = new GLib.Variant ('a{sd}', {
                x:parseInt(data[0]),
                y:parseInt(data[1]),
                width:parseInt(data[2]),
                height:parseInt(data[3]),
                zoom:parseFloat(data[4]),
                marginTop:parseInt(data[5]),
                marginBottom:parseInt(data[6]),
                marginLeft:parseInt(data[7]),
                marginRight:parseInt(data[8]),
                monitorIndex:parseInt(data[9])
            });
            desktopVariants.push(datavariant);
            break;
        case '-M':
            primaryIndex = parseInt(arg);
            break;
        }
        lastCommand = null;
    }
    if (desktops.length == 0) {
        /* if no desktop list is provided, like when launching the program in stand-alone mode,
         * configure a 1280x720 desktop
         */
        desktops.push({x:0, y:0, width: 1280, height: 720, zoom: 1, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, monitorIndex: 0});
        desktopVariants.push(new GLib.Variant ('a{sd}', {x:0, y:0, width: 1280, height: 720, zoom: 1, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, monitorIndex: 0}));
    }
}

parseCommandLine(ARGV);

// this allows to import files from the current folder

imports.searchPath.unshift(codePath);

const DBusUtils = imports.dbusUtils;
const Prefs = imports.preferences;
const Gettext = imports.gettext;

let localePath = GLib.build_filenamev([codePath, "locale"]);
if (Gio.File.new_for_path(localePath).query_exists(null)) {
    Gettext.bindtextdomain("ding", localePath);
}

const DesktopManager = imports.desktopManager;

var desktopManager = null;

if (asDesktop) {
    remoteDingUpdate = Gio.DBusActionGroup.get(
        Gio.DBus.session,
        'com.rastersoft.ding',
        '/com/rastersoft/ding/updateGridWindows'
    );
} else {
    remoteDingUpdate = Gio.DBusActionGroup.get(
        Gio.DBus.session,
        'com.rastersoft.dingtest',
        '/com/rastersoft/dingtest/updateGridWindows'
    );
}

// Use different AppIDs to allow to test it from a command line while the main desktop is also running from the extension
const dingApp = new Gtk.Application({application_id: asDesktop ? 'com.rastersoft.ding' : 'com.rastersoft.dingtest',
                                     flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE});

dingApp.connect('startup', () => {
    Prefs.init(codePath);
    DBusUtils.init();
});

dingApp.connect('activate', () => {
    if (!desktopManager) {
        desktopManager = new DesktopManager.DesktopManager(dingApp,
                                                           desktops,
                                                           codePath,
                                                           asDesktop,
                                                           primaryIndex);
    }
});

dingApp.connect('command-line', (app, commandLine) => {
    let argv =[];
    argv = commandLine.get_arguments();
    parseCommandLine(argv);
    if (! errorFound) {
        if (commandLine.get_is_remote()) {
            desktopManager.updateGridWindows(desktops);
            // If testing Dbus activations, comment the above and uncomment the following
            //remoteDingUpdate.activate_action('updateGridWindows', new GLib.Variant('av', desktopVariants));
        } else {
            dingApp.activate();
        }
        commandLine.set_exit_status(0);
    } else {
        commandLine.set_exit_status(1);
    }
});

dingApp.run(ARGV);

if (!errorFound) {
    0;
} else {
    1;
}
