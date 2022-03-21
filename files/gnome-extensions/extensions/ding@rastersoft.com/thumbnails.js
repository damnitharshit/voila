/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2021 Sergio Costas (rastersoft@gmail.com)
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

const GnomeDesktop = imports.gi.GnomeDesktop;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

var ThumbnailLoader = class {

    constructor(codePath) {
        this._timeoutValue = 5000;
        this._codePath = codePath;
        this._thumbList = [];
        this._thumbnailScriptWatch = null;
        this._running = false;
        this._thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.LARGE);
    }

    _generateThumbnail(file, callback) {
        this._thumbList.push([file, callback]);
        if (!this._running) {
            this._launchNewBuild();
        }
    }

    _launchNewBuild() {
        let file, callback;
        do {
            if (this._thumbList.length == 0) {
                this._running = false;
                return;
            }
            // if the file disappeared while waiting in the queue, don't refresh the thumbnail
            [file, callback] = this._thumbList.shift();
            if (file.file.query_exists(null)) {
                break;
            }
        } while(true);
        this._running = true;
        let args = [];
        args.push(GLib.build_filenamev([this._codePath, 'createThumbnail.js']));
        args.push(file.path);
        this._proc = new Gio.Subprocess({argv: args});
        this._proc.init(null);
        this._proc.wait_check_async(null, (source, result) => {
            if (this._timeoutID != 0) {
                GLib.source_remove(this._timeoutID);
                this._timeoutID = 0;
            }
            try {
                let result2 = source.wait_check_finish(result);
                if (result2) {
                    let status = source.get_status();
                    if (status == 0) {
                        callback();
                    }
                } else {
                    print(`Failed to generate thumbnail for ${file.displayName}`);
                }
            } catch(error) {
                print(`Exception when generating thumbnail for ${file.displayName}: ${error}`);
            }
            this._launchNewBuild();
        });
        this._timeoutID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutValue, () => {
            print(`Timeout while generating thumbnail for ${file.displayName}`);
            this._timeoutID = 0;
            this._proc.force_exit();
            this._thumbnailFactory.create_failed_thumbnail(file.uri, file.modifiedTime);
            return false;
        });
    }

    canThumbnail(file) {
        return this._thumbnailFactory.can_thumbnail(file.uri,
                                                    file.attributeContentType,
                                                    file.modifiedTime);
    }

    getThumbnail(file, callback) {
        try {
            let thumbnail = this._thumbnailFactory.lookup(file.uri, file.modifiedTime);
            if (thumbnail == null) {
                if (!this._thumbnailFactory.has_valid_failed_thumbnail(file.uri, file.modifiedTime)) {
                    this._generateThumbnail(file, callback);
                }
            }
            return thumbnail;
        } catch(error) {
            print(`Error when asking for a thumbnail for ${file.displayName}: ${error}`);
        }
        return null;
    }
}
