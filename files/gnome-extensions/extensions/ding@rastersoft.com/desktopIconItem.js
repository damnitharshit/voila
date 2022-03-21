
/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2021 Sundeep Mediratta (smedius@gmail.com)
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 * SwitcherooControl code based on code original from Marsch84
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

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Cairo = imports.gi.cairo;
const DesktopIconsUtil = imports.desktopIconsUtil;

const Prefs = imports.preferences;
const Enums = imports.enums;
const DBusUtils = imports.dbusUtils;

const ByteArray = imports.byteArray;
const Signals = imports.signals;
const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var desktopIconItem = class desktopIconItem {

    constructor(desktopManager, fileExtra) {
        this._desktopManager = desktopManager;
        this._fileExtra = fileExtra;
        this._loadThumbnailDataCancellable = null;
        this._queryFileInfoCancellable = null;
        this._grid = null;
        this._lastClickTime = 0;
        this._lastClickButton = 0;
        this._clickCount = 0;
        this._isSelected = false;
        this._isSpecial = false;
        this._primaryButtonPressed = false;
        this._savedCoordinates = null;
        this._dropCoordinates = null;
        this._destroyed = false;
    }

    /***********************
     * Destroyers *
     ***********************/

    removeFromGrid(callOnDestroy) {
        if (this._grid) {
            this._grid.removeItem(this);
            this._grid = null;
        }
        if (callOnDestroy) {
            this._onDestroy();
        }
    }

    _destroy() {
        /* Regular file data */
        if (this._queryFileInfoCancellable) {
            this._queryFileInfoCancellable.cancel();
        }

        /* Thumbnailing */
        if (this._loadThumbnailDataCancellable) {
            this._loadThumbnailDataCancellable.cancel();
        }
        /* Container */
        if (this._containerId) {
            this.container.disconnect(this._containerId);
            this._containerId = 0;
        }
    }

    _onDestroy() {
        this._destroy();
        this._destroyed = true;
    }

    /***********************
     * Creators *
     ***********************/

    _createIconActor() {
        this.container = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER});
        this._containerId = this.container.connect('destroy', () => this._onDestroy());
        this._eventBox = new Gtk.EventBox({visible: true, halign: Gtk.Align.CENTER});
        this._sheildEventBox = new Gtk.EventBox({visible: true, halign: Gtk.Align.CENTER});
        this._labelEventBox = new Gtk.EventBox({visible: true, halign: Gtk.Align.CENTER});
        this._sheildLabelEventBox = new Gtk.EventBox({visible: true, halign: Gtk.Align.CENTER});

        this._icon = new Gtk.Image();
        this._iconContainer = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        this._iconContainer.pack_start(this._icon, true, true, 0);
        this._iconContainer.set_baseline_position(Gtk.BaselinePosition.CENTER);
        this._eventBox.add(this._iconContainer);
        this._sheildEventBox.add(this._eventBox);

        this._label = new Gtk.Label();
        this._labelContainer = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER});
        let labelStyleContext = this._label.get_style_context();
        labelStyleContext.add_class('file-label');
        this._label.set_ellipsize(Pango.EllipsizeMode.END);
        this._label.set_line_wrap(true);
        this._label.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this._label.set_yalign(0.0);
        this._label.set_justify(Gtk.Justification.CENTER);
        this._label.set_lines(2);
        this._labelContainer.pack_start(this._label, false, true, 0);
        this._labelEventBox.add(this._labelContainer);
        this._sheildLabelEventBox.add(this._labelEventBox);

        this.container.pack_start(this._sheildEventBox, false, false, 0);
        this.container.pack_start(this._sheildLabelEventBox, false, false, 2);

        this._styleContext = this._iconContainer.get_style_context();
        this._labelStyleContext = this._labelContainer.get_style_context();
        this._styleContext.add_class('file-item');
        this._labelStyleContext.add_class('file-item');

        this.iconRectangle = new Gdk.Rectangle();
        this.labelRectangle = new Gdk.Rectangle();

        /* We need to allow the "button-press" event to pass through the callbacks, to allow the DnD to work
         * But we must avoid them to reach the main window.
         * The solution is to allow them to pass in a EventBox, used both for detecting the events and the DnD, and block them
         * in a second EventBox, located outside.
         */
        this._sheildEventBox.connect('button-press-event', (actor, event) => {return true;});
        this._sheildLabelEventBox.connect('button-press-event', (actor, event) => {return true;});
        this._eventBox.connect('button-press-event', (actor, event) => this._onPressButton(actor, event));
        this._eventBox.connect('enter-notify-event', (actor, event) => this._onEnter(actor, event));
        this._eventBox.connect('leave-notify-event', (actor, event) => this._onLeave(actor, event));
        this._eventBox.connect('button-release-event', (actor, event) => this._onReleaseButton(actor, event));
        this._eventBox.connect('drag-motion', (widget, context, x, y, time) => {
            this.highLightDropTarget(x, y);
        });
        this._eventBox.connect('drag-leave', () => {
            this.unHighLightDropTarget();
        });
        this._eventBox.connect('size-allocate', () => this._calculateIconRectangle());
        this._labelEventBox.connect('button-press-event', (actor, event) => this._onPressButton(actor, event));
        this._labelEventBox.connect('enter-notify-event', (actor, event) => this._onEnter(actor, event));
        this._labelEventBox.connect('leave-notify-event', (actor, event) => this._onLeave(actor, event));
        this._labelEventBox.connect('button-release-event', (actor, event) => this._onReleaseButton(actor, event));
        this._labelEventBox.connect('drag-motion', (widget, context, x, y, time) => {
            this.highLightDropTarget(x, y);
        });
        this._labelEventBox.connect('drag-leave', () => {
            this.unHighLightDropTarget();
        });
        this._labelEventBox.connect('size-allocate', () => {
            this._doLabelSizeAllocated();
        });
        this.container.connect('drag-motion', (widget, context, x, y, time) => {
            this.highLightDropTarget(x, y);
        });
        this.container.connect('drag-leave', () => {
            this.unHighLightDropTarget();
        });

        if (this._desktopManager.showDropPlace) {
            this._setDropDestination(this.container);
        } else {
            this._setDropDestination(this._eventBox);
            this._setDropDestination(this._labelEventBox);
        }
        this._setDragSource(this._eventBox);
        this._setDragSource(this._labelEventBox);
        this.container.show_all();
    }

    _doLabelSizeAllocated() {
        this._calculateLabelRectangle();
    }

    _calculateIconRectangle() {
        this.iconwidth = this._iconContainer.get_allocated_width();
        this.iconheight = this._iconContainer.get_allocated_height();
        let x = this._x1 + ((this.width - this.iconwidth)/2)*this._zoom;
        let y = this._y1 + 2;
        this.iconRectangle.x = x;
        this.iconRectangle.y = y;
        this.iconRectangle.width = this.iconwidth*this._zoom;
        this.iconRectangle.height = this.iconheight*this._zoom;
    }

    _calculateLabelRectangle() {
        this.labelwidth = this._labelContainer.get_allocated_width();
        this.labelheight = this._labelContainer.get_allocated_height();
        let x = this._x1 + ((this.width - this.labelwidth)/2)*this._zoom;
        let y = this._y1 + 4 + (this.iconheight)*this._zoom;
        this.labelRectangle.x = x;
        this.labelRectangle.y = y;
        this.labelRectangle.width = this.labelwidth*this._zoom;
        this.labelRectangle.height = this.labelheight*this._zoom;
    }

    setCoordinates(x, y, width, height, margin, zoom, grid) {
        this._x1 = x;
        this._y1 = y;
        this.width = width;
        this.height = height;
        this._zoom = zoom;
        this._x2 = x + (width * zoom) - 1;
        this._y2 = y + (height * zoom) - 1;
        this._grid = grid;
        this.container.set_size_request(width, height);
        this._label.margin_start = margin;
        this._label.margin_end = margin;
        this._label.margin_bottom = margin;
        this._iconContainer.margin_top = margin;
        this._calculateIconRectangle();
        this._calculateLabelRectangle();
    }

    getCoordinates() {
        return [this._x1, this._y1, this._x2, this._y2, this._grid];
    }

    _setLabelName(text) {
        this._currentFileName = text;
        this._eventBox.set_tooltip_text(text);
        // Add an invisible space after any of these characters
        // to ensure that the label can be split correctly in
        // several lines.
        for (let character of ".,-_@:") {
            text = text.split(character).join(character + '\u200B');
        }
        this._label.label = text;
    }

    /***********************
     * Button Clicks *
     ***********************/

    _updateClickState(event) {
        let settings = Gtk.Settings.get_default();

        if ((event.get_button()[1] == this._lastClickButton) &&
            ((event.get_time() - this._lastClickTime) < settings.gtk_double_click_time))
            this._clickCount++;
        else
            this._clickCount = 1;

        this._lastClickTime = event.get_time();
        this._lastClickButton = event.get_button()[1];
    }

    getClickCount() {
        return this._clickCount;
    }

    _onPressButton(actor, event) {
        this._updateClickState(event);
        let button = event.get_button()[1];
        let [a, x, y] = event.get_coords();
        let state = event.get_state()[1];
        this._buttonPressInitialX = x;
        this._buttonPressInitialY = y;
        let shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
        let controlPressed = !!(state & Gdk.ModifierType.CONTROL_MASK);
        if (button == 3) {
            this._doButtonThreePressed(event, shiftPressed, controlPressed);
        } else if (button == 1) {
            this._doButtonOnePressed(event, shiftPressed, controlPressed);
        }
        return false;
    }

    _onReleaseButton(actor, event) {
        let button = event.get_button()[1];
        if (button == 1) {
            this._doButtonOneReleased(event);
        }
        return false;
    }

    _doButtonThreePressed(event) {
        if (!this._isSelected) {
            this._desktopManager.selected(this, Enums.Selection.RIGHT_BUTTON);
        }
        this._desktopManager.fileItemMenu.showMenu(this, event);
    }

    _doButtonOnePressed(event, shiftPressed, controlPressed) {
        if (this.getClickCount() == 1) {
            this._primaryButtonPressed = true;
            if (shiftPressed || controlPressed) {
                this._desktopManager.selected(this, Enums.Selection.WITH_SHIFT);
            } else {
                this._desktopManager.selected(this, Enums.Selection.ALONE);
            }
        }
    }

    _doButtonOneReleased(event) {
    }

    /***********************
     * Drag and Drop *
     ***********************/

    _onEnter(actor, event) {
        if (!this._styleContext.has_class('file-item-hover')) {
            this._styleContext.add_class('file-item-hover');
            this._labelStyleContext.add_class('file-item-hover');
        }
        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._eventBox.get_window();
            if (window) {
                window.set_cursor(Gdk.Cursor.new_from_name(Gdk.Display.get_default(), "hand"));
            }
        }
        return false;
    }

    _onLeave(actor, event) {
        this._primaryButtonPressed = false;
        if (this._styleContext.has_class('file-item-hover')) {
            this._styleContext.remove_class('file-item-hover');
            this._labelStyleContext.remove_class('file-item-hover');
        }
        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._eventBox.get_window();
            if (window) {
                window.set_cursor(Gdk.Cursor.new_from_name(Gdk.Display.get_default(), "default"));
            }
        }
        return false;
    }

    _hasToRouteDragToGrid() {
        if (this._grid) {
            return true;
        }
    }

    highLightDropTarget(x, y) {
        if (this._hasToRouteDragToGrid()) {
            this._grid.receiveMotion(this._x1, this._y1, true);
            return;
        }
        if (! this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.add_class('desktop-icons-selected');
            this._labelStyleContext.add_class('desktop-icons-selected');
        }
        this._grid.highLightGridAt(this._x1, this._y1);
    }

    unHighLightDropTarget() {
        if (this._hasToRouteDragToGrid()) {
            this._grid.receiveLeave();
            return;
        }
        if (! this._isSelected && this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.remove_class('desktop-icons-selected');
            this._labelStyleContext.remove_class('desktop-icons-selected');
        }
        this._grid.unHighLightGrids();
    }

    setSelected() {
        this._isSelected = true;
        this._setSelectedStatus();
    }

    unsetSelected() {
        this._isSelected = false;
        this._setSelectedStatus();
    }

    toggleSelected() {
        this._isSelected = !this._isSelected;
        this._setSelectedStatus();
    }

    _setSelectedStatus() {
        if (this._isSelected && !this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.add_class('desktop-icons-selected');
            this._labelStyleContext.add_class('desktop-icons-selected');
        }
        if (!this._isSelected && this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.remove_class('desktop-icons-selected');
            this._labelStyleContext.remove_class('desktop-icons-selected');
        }
    }

    _setDragSource(widget) {
        widget.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, null, Gdk.DragAction.MOVE | Gdk.DragAction.COPY);
        let targets = new Gtk.TargetList(null);
        targets.add(Gdk.atom_intern('x-special/ding-icon-list', false), Gtk.TargetFlags.SAME_APP, 0);
        if ((this._fileExtra != Enums.FileType.USER_DIRECTORY_TRASH) &&
            (this._fileExtra != Enums.FileType.USER_DIRECTORY_HOME) &&
            (this._fileExtra != Enums.FileType.EXTERNAL_DRIVE)) {
                targets.add(Gdk.atom_intern('x-special/gnome-icon-list', false), 0, 1);
                targets.add(Gdk.atom_intern('text/uri-list', false), 0, 2);
        }
        widget.drag_source_set_target_list(targets);
        widget.connect('drag-begin', (widget, context) => {
            let surf = new Cairo.ImageSurface(Cairo.SurfaceType.IMAGE, this.container.get_allocated_width(), this.container.get_allocated_height());
            let cr = new Cairo.Context(surf);
            this.container.draw(cr);
            let itemnumber = this._desktopManager.getNumberOfSelectedItems();
            if (itemnumber > 1) {
                Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: this._desktopManager.selectColor.red,
                                                            green: this._desktopManager.selectColor.green,
                                                            blue: this._desktopManager.selectColor.blue,
                                                            alpha: 0.6})
                );
                itemnumber -= 1;
                switch (itemnumber.toString().length) {
                    case 1: cr.rectangle(1, 1, 30, 20); break;
                    case 2: cr.rectangle(1, 1, 40, 20); break;
                    default: cr.rectangle(1, 1, 50, 20); break;
                }
                cr.fill();
                cr.setFontSize(18);
                Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: 1.0, green: 1.0 , blue: 1.0, alpha: 1}));
                cr.moveTo(1,17);
                cr.showText(`+${itemnumber}`)
            }
            Gtk.drag_set_icon_surface(context, surf);
            let [x, y] = this._calculateOffset(widget);
            context.set_hotspot(x,y);
            this._desktopManager.onDragBegin(this);
        });
        widget.connect('drag-data-get', (widget, context, data, info, time) => {
            let dragData = this._desktopManager.fillDragDataGet(info);
            if (dragData != null) {
                let list = ByteArray.fromString(dragData[1]);
                data.set(dragData[0], 8, list);
            }
        });
        widget.connect('drag-end', (widget, context) => {
            this._desktopManager.onDragEnd();
        })
    }

    _calculateOffset(widget) {
        if (widget == this._eventBox) {
            return [((this.width - this.iconwidth)/2) + this._buttonPressInitialX, this._buttonPressInitialY];
        } else {
            return [((this.width - this.labelwidth)/2) + this._buttonPressInitialX, (this.iconheight + 2) + this._buttonPressInitialY];
        }
    }

    _setDropDestination(dropDestination) {
        return;
    }

    /***********************
     * Icon Rendering *
     ***********************/

    updateIcon() {
        this._updateIcon();
    }

    async _updateIcon() {
        if (this._destroyed) {
            return;
        }

        this._icon.set_padding(0,0);
        try {
            let customIcon = this._fileInfo.get_attribute_as_string('metadata::custom-icon');
            if (customIcon && (customIcon != '')) {
                let customIconFile = Gio.File.new_for_uri(customIcon);
                if (customIconFile.query_exists(null)) {
                    let loadedImage = await this._loadImageAsIcon(customIconFile);
                    if (loadedImage | this._destroyed) {
                        return;
                    }
                }
            }
        } catch (error) {
            print(`Error while updating icon: ${error.message}.\n${error.stack}`);
        }

        if (this._fileExtra == Enums.FileType.USER_DIRECTORY_TRASH) {
            let pixbuf = this._createEmblemedIcon(this._fileInfo.get_icon(), null);
            const scale = this._icon.get_scale_factor();
            let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);
            this._icon.set_from_surface(surface);
            return;
        }
        let icon_set = false;
        if ((Prefs.nautilusSettings.get_string('show-image-thumbnails') != 'never') &&
            (this._desktopManager.thumbnailLoader.canThumbnail(this))) {
                let thumbnail = this._desktopManager.thumbnailLoader.getThumbnail(this, this._updateIcon.bind(this));
                if (thumbnail != null) {
                    let thumbnailFile = Gio.File.new_for_path(thumbnail);
                    icon_set = await this._loadImageAsIcon(thumbnailFile);
                    if (this._destroyed) {
                        return;
                    }
                }
        }

        if (!icon_set) {
            let pixbuf;
            if (this._isBrokenSymlink) {
                pixbuf = this._createEmblemedIcon(null, 'text-x-generic');
            } else {
                if (this.trustedDesktopFile && this._desktopFile.has_key('Icon')) {
                    pixbuf = this._createEmblemedIcon(null, this._desktopFile.get_string('Icon'));
                } else {
                    pixbuf = this._createEmblemedIcon(this._getDefaultIcon(), null);
                }
            }
            const scale = this._icon.get_scale_factor();
            let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);
            this._icon.set_from_surface(surface);
        }
    }

    _getDefaultIcon() {
        if (this._fileExtra == Enums.FileType.EXTERNAL_DRIVE) {
            return this._custom.get_icon();
        }
        return this._fileInfo.get_icon();
    }

    _loadImageAsIcon(imageFile) {

        if (this._loadThumbnailDataCancellable)
            this._loadThumbnailDataCancellable.cancel();
        this._loadThumbnailDataCancellable = new Gio.Cancellable();

        return new Promise( (resolve, reject) => {
            imageFile.load_bytes_async(this._loadThumbnailDataCancellable, (source, result) => {
                this._loadThumbnailDataCancellable = null;
                try {
                    let [thumbnailData, etag_out] = source.load_bytes_finish(result);
                    let thumbnailStream = Gio.MemoryInputStream.new_from_bytes(thumbnailData);
                    let thumbnailPixbuf = GdkPixbuf.Pixbuf.new_from_stream(thumbnailStream, null);

                    if (thumbnailPixbuf != null) {
                        let width = Prefs.get_desired_width() - 8;
                        let height = Prefs.get_icon_size() - 8;
                        let aspectRatio = thumbnailPixbuf.width / thumbnailPixbuf.height;
                        if ((width / height) > aspectRatio)
                            width = height * aspectRatio;
                        else
                            height = width / aspectRatio;
                        const scale = this._icon.get_scale_factor();
                        width *= scale;
                        height *= scale;
                        let pixbuf = thumbnailPixbuf.scale_simple(Math.floor(width), Math.floor(height), GdkPixbuf.InterpType.BILINEAR);
                        pixbuf = this._addEmblemsToPixbufIfNeeded(pixbuf);
                        let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);
                        this._icon.set_from_surface(surface);
                        this._icon.set_padding(4,4)
                        resolve(true);
                    }
                    resolve(false);
                } catch(e) {
                    resolve(false);
                }
            });
        });
    }

    _copyAndResizeIfNeeded(pixbuf) {
        /**
         * If the pixbuf is the original from the theme, copies it into a new one, to be able
         * to paint the emblems without altering the cached pixbuf in the theme object.
         * Also, ensures that the copied pixbuf is, at least, as big as the desired icon size,
         * to ensure that the emblems fit.
         */

        if (this._copiedPixbuf) {
            return pixbuf;
        }

        this._copiedPixbuf = true;
        let minsize = Prefs.get_icon_size();
        if ((pixbuf.width < minsize) || (pixbuf.height < minsize)) {
            let width = (pixbuf.width < minsize) ? minsize : pixbuf.width;
            let height = (pixbuf.height < minsize) ? minsize : pixbuf.height;
            let newpixbuf = GdkPixbuf.Pixbuf.new(pixbuf.colorspace, true, pixbuf.bits_per_sample, width, height);
            newpixbuf.fill(0);
            let x = Math.floor((width - pixbuf.width) / 2);
            let y = Math.floor((height - pixbuf.height) / 2);
            pixbuf.composite(newpixbuf, x, y, pixbuf.width, pixbuf.height, x, y, 1, 1,  GdkPixbuf.InterpType.NEAREST, 255);
            return newpixbuf;
        } else {
            return pixbuf.copy();
        }
    }

    _addEmblemsToPixbufIfNeeded(pixbuf) {
        const scale = this._icon.get_scale_factor();
        this._copiedPixbuf = false;
        let emblem = null;
        let finalSize = Math.floor(Prefs.get_icon_size() / 3) * scale;
        if (this._isSymlink) {
            if (this._isBrokenSymlink)
                emblem = Gio.ThemedIcon.new('emblem-unreadable');
            else
                emblem = Gio.ThemedIcon.new('emblem-symbolic-link');
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            let emblemIcon = theme.lookup_by_gicon_for_scale(emblem, finalSize / scale, scale, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, pixbuf.width - finalSize, pixbuf.height - finalSize, finalSize, finalSize, pixbuf.width - finalSize, pixbuf.height - finalSize, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }

        if (this.trustedDesktopFile) {
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            emblem = Gio.ThemedIcon.new('emblem-default');
            let emblemIcon = theme.lookup_by_gicon_for_scale(emblem, finalSize / scale, scale, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, 0, 0, finalSize, finalSize, 0, 0, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }
        if (this.isStackTop && ! this.stackUnique) {
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            emblem = Gio.ThemedIcon.new('emblem-downloads');
            let emblemIcon = theme.lookup_by_gicon_for_scale(emblem, finalSize / scale, scale, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, 0, 0, finalSize, finalSize, 0, 0, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }
        return pixbuf;
    }

    _createEmblemedIcon(icon, iconName) {
        if (icon == null) {
            if (GLib.path_is_absolute(iconName)) {
                let iconFile = Gio.File.new_for_commandline_arg(iconName);
                icon = new Gio.FileIcon({ file: iconFile });
            } else {
                icon = Gio.ThemedIcon.new_with_default_fallbacks(iconName);
            }
        }
        let theme = Gtk.IconTheme.get_default();

        const scale = this._icon.get_scale_factor();
        let itemIcon = null;
        try {
            itemIcon = theme.lookup_by_gicon_for_scale(icon, Prefs.get_icon_size(), scale, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
        } catch (e) {
            itemIcon = theme.load_icon_for_scale("text-x-generic", Prefs.get_icon_size(), scale, Gtk.IconLookupFlags.FORCE_SIZE);
        }

        itemIcon = this._addEmblemsToPixbufIfNeeded(itemIcon);

        return itemIcon;
    }

    /***********************
     * Getters and setters *
     ***********************/

    get state() {
        return this._state;
    }

    set state(state) {
        if (state == this._state)
            return;

        this._state = state;
    }

    get isDrive() {
        return this._fileExtra == Enums.FileType.EXTERNAL_DRIVE;
    }

    get isSelected() {
        return this._isSelected;
    }

    get isSpecial() {
        return this._isSpecial;
    }

    get dropCoordinates() {
        return this._dropCoordinates;
    }

    set dropCoordinates(pos) {
        this._dropCoordinates = pos;
    }
}
Signals.addSignalMethods(desktopIconItem.prototype);
