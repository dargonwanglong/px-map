/**
 * @license
 * Copyright (c) 2018, General Electric
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function() {
  'use strict';

  /****************************************************************************
   * BEHAVIORS
   ****************************************************************************/

  /* Ensures the behavior namespace is created */
  window.PxMapBehavior = (window.PxMapBehavior || {});

  /**
   *
   * @polymerBehavior PxMapBehavior.TrackMarkers
   */
  PxMapBehavior.TrackMarkersImpl = {
    properties: {
      /**
       * Updates the visible bounds of the map to fit all markers as they are
       * added. Markers are continuously monitored for changes, and any new
       * markers added late in the map's lifecycle (e.g. markers created
       * dynamically long after the map is loaded) will trigger an additional
       * resize of the map if they are not within its current visible bounds.
       *
       * This attribute is dynamic. To stop map resizes after some amount of time,
       * disable this attribute.
       *
       *
       * @type {Object}
       */
      fitToMarkers: {
        type: Boolean,
        value: false,
        observer: '_fitMapToMarkersIfSet'
      },

      /**
       * Optional setting that only works if `fitToMarkers` is enabled. Adds a
       * padding between the edges of the map and the visible markers shown.
       * Set to a percentage value (e.g. `0.25` for 25%). Defaults to 15%, setting
       * to a lower value will lead to some large markers potentially not fitting
       * on the map.
       *
       * @type {Number}
       */
      fitToMarkersPadding: {
        type: Number,
        value: 0.15
      },

      /**
       * Optional setting that only works if `fitToMarkers` is enabled. Determines
       * how the map will calculate its zoom level when fitting markers.
       * Choose from the following options (default is 'max'):
       *
       *    * 'max' - the map will zoom out to `minZoom` level regardless of
       *      currently rendered markers
       *    * 'min' - the map will attempt to zoom in to the lowest level (within
       *      the `maxZoom` setting) that fits all markers, provided the markers
       *      are rendered close together.
       *    * 'auto' - the map will zoom in our out to the whatever level it
       *      needs to fit all rendered markers (within the map's `minZoom` or
       *     `maxZoom`)
       *
       * @type {String}
       */
      fitToMarkersZoom: {
        type: String,
        value: 'max'
      }
    },

    addInst(parent) {
      this.listen(this, 'px-map-marker-added', '_handleMarkerAdded');
      this.listen(this, 'px-map-marker-group-features-changed', '_handleMarkerGroupUpdated');

      this._knownMarkers = (this._knownMarkers || new Map());

      PxMapBehavior.DrawToolbarImpl.addInst.call(this);
    },

    removeInst(parent) {
      this.unlisten(this, 'px-map-marker-added', '_handleMarkerAdded');
      this.unlisten(this, 'px-map-marker-group-features-changed', '_handleMarkerGroupUpdated');

      if (this._knownMarkers && this._knownMarkers instanceof Map) {
        this._knownMarkers.clear();
      }
      this._knownMarkers = null;

      PxMapBehavior.LeafletRootImpl.removeInst.call(this);
    },

    /**
     * When an individual marker is added, record its location in the known markers
     * map and ask the map to fit it later.
     *
     * Bind listeners on remove to keep the known markers map updated.
     */
    _handleMarkerAdded(evt) {
      if (!this._knownMarkers) return;

      const localEvt = Polymer.dom(evt);

      if (localEvt.rootTarget && localEvt.rootTarget.elementInst && localEvt.event.detail.latLng) {
        this._knownMarkers.set(localEvt.rootTarget.elementInst, localEvt.event.detail.latLng);
        this.listen(localEvt.rootTarget, 'px-map-marker-removed', '_handleMarkerRemoved');
        this._fitMapToMarkersIfSet();
      }
    },

    /**
     * When an individual marker is removed, delete it from the known markers
     * map and stop. Don't ask the map to refit its bounds.
     *
     * Unbind listeners so the element can be cleaned up.
     */
    _handleMarkerRemoved(evt) {
      if (!this._knownMarkers) return;

      const localEvt = Polymer.dom(evt);
      const knownMarker = this._knownMarkers.has(localEvt.rootTarget.elementInst || null);

      if (knownMarker) {
        this.unlisten(localEvt.rootTarget, 'px-map-marker-removed', '_handleMarkerRemoved');
        this._knownMarkers.delete(localEvt.rootTarget.elementInst);
      }
    },

    /**
     * When marker groups are updated, set their new bounds in the known markers
     * map. We don't need to worry about whether we've seen them before.
     *
     * Bind listeners on remove to keep the known markers map updated.
     */
    _handleMarkerGroupUpdated(evt) {
      if (!this._knownMarkers) return;

      const localEvt = Polymer.dom(evt);
      const knownMarker = this._knownMarkers.has(localEvt.rootTarget.elementInst || null);

      if (localEvt.rootTarget && localEvt.rootTarget.elementInst) {
        if (!knownMarker) {
          this.listen(localEvt.rootTarget, 'px-map-marker-group-removed', '_handleMarkerGroupRemoved');
        }

        this._knownMarkers.set(this.elementInst, localEvt.event.detail.bounds);
        this._fitMapToMarkersIfSet();
      }
    },

    /**
     * When marker groups are removed, delete their bounds from the known markers
     * map and stop. Don't ask the map to refit its bounds.
     *
     * Unbind listeners so the element can be cleaned up.
     */
    _handleMarkerGroupRemoved(evt) {
      if (!this._knownMarkers) return;

      const localEvt = Polymer.dom(evt);
      const knownMarker = this._knownMarkers.has(localEvt.rootTarget.elementInst || null);

      if (knownMarker) {
        this.unlisten(localEvt.rootTarget, 'px-map-marker-group-removed', '_handleMarkerGroupRemoved');
        this._knownMarkers.delete(localEvt.rootTarget.elementInst);
      }
    },

    /**
     * Debounced function that iterates over the known markers map and fits the
     * visible bounds of the map.
     */
    _fitMapToMarkers() {
      this.debounce('fit-map-to-bounds', function() {
        if (!this._knownMarkers || !this._knownMarkers.size) return;

        const bounds = this._markersToBoundsWithPadding(this._knownMarkers, this.fitToMarkersPadding);
        if (bounds && bounds.isValid()) {
          const latLng = bounds.getCenter();
          const zoom = this._getZoomLevelForFit(bounds, this.fitToMarkersZoom, this.elementInst);
          this.elementInst.setView(latLng, zoom);

          /**
           * This setTimeout is added because of a leaflet known issue when
           *  changing both zoom level and map center at the same time. In rare
           * cases where the new center is already in view, and a zoom level is
           * being passed in, the map will not center properly.
           * Ref: https://github.com/Leaflet/Leaflet/issues/3249#issuecomment-75931374
           */
          const mapInst = this.elementInst;
          setTimeout(function() {
            if (mapInst.getCenter() !== latLng) {
              mapInst.panTo(latLng);
            }
          }, 300);
        }
      }, 10);
    },

    /**
     * Takes a Map of known markers with values representing the marker's geometry
     * as a `L.LatLng` or `L.LatLngBounds` instance and creates a bounds object
     * that encompasses all the markers. Optionally pads the bounds by a percentage
     * with the `padding` param.
     *
     * @param {Map} markersMap
     * @param {Number} [padding]
     * @return {L.LatLngBounds}
     */
    _markersToBoundsWithPadding(markersMap, padding) {
      if (!markersMap || !markersMap.size) return;
      let bounds = L.latLngBounds();

      markersMap.forEach(value => {
        if (value instanceof L.LatLng || value instanceof L.LatLngBounds) {
          bounds.extend(value);
        }
      });

      if (bounds.isValid() && (typeof padding === 'number')) {
        bounds = bounds.pad(padding);
      }

      return bounds;
    },

    /**
     * Takes a bounds, fit setting, zoom level, and map instance, and returns a
     * new zoom level for the map.
     *
     * Note: A setting of 'auto' can now be used for all zoom levels
     *
     * @param {L.LatLngBounds} bounds
     * @param {String} fitSetting - see `fitToMarkersZoom` property for more details
     * @param {L.Map} map
     * @return {Number}
     */
    _getZoomLevelForFit(bounds, fitSetting, map) {
      let zoom;

      if (fitSetting === 'min') {
        zoom = map.getMinZoom() || 0;
      } else if (fitSetting === 'max') {
        zoom = map.getBoundsZoom(bounds, true) - 2;
      } else {
        // Temporarily set the "inside" param of getBoundsZoom to be false, as leaflet is
        // reversing this setting in their code when determining the correct direction to zoom.
        zoom = map.getBoundsZoom(bounds, false);
      }

      return zoom;
    },

    /**
     * Called when the `fitToMarkers` attribute is updated. If it is set to true
     * and a map is set, call the internal `_fitMapToMarkers` method.
     */
    _fitMapToMarkersIfSet() {
      if (!this.elementInst || !this.fitToMarkers) return;
      this._fitMapToMarkers();
    },

    /**
     * Sets the map's visible bounds (latitude, longitude, and zoom) to fit all
     * attached markers in a single view.
     *
     * Enable the `fit-to-markers` attribute to automatically fit all markers as
     * they are added to the map.
     *
     * @return {Boolean} `true` if there were markers to fit, `false` if there were no markers to fit
     */
    fitMapToMarkers() {
      if (!this.elementInst || !this._knownMarkers || !this._knownMarkers.size) {
        return false;
      }

      this._fitMapToMarkers();
      return true;
    }
  };

  /**
   *
   * @polymerBehavior PxMapBehavior.DrawToolbarImpl
   */
  PxMapBehavior.DrawToolbarImpl = {
    properties: {
      /**
       * The position of the drawing toolbal to display.
       * Available positions are: 'topleft', 'topright', 'bottomleft', 'bottomright'
       */
      drawToolbarPosition: {
        type: String,
        value: 'topleft',
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * Indicate whether to show the drawing toolbar on map.
       */
      showDrawToolbar: {
        type: Boolean,
        value: false,
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * The language code for the drawing controls, used for i18N.
       * Currently available languages are: cz, da, de, el, en, es, fa, fr, hu, id, it, nl, no, pl, pt_br, ro, ru, sv, tr, ua, zh and zh_tw.
       */
      drawToolbarLanguage: {
        type: String,
        value: 'en',
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * The controls setting for the drawing toolbar.
       *
       * See https://github.com/geoman-io/leaflet-geoman
       */
      drawControls: {
        type: Object,
        value: function() {
          return {
            drawMarker: false,
            drawCircleMarker: false,
            drawRectangle: false,
            drawPolyline: false,
            rotateMode: false,
            drawText: false,
            editControls: false
          };
        }
      },

      /**
       * The tooltip content of custom Finish button
       */
      drawFinishTitle: {
        type: String,
        value: 'Finish'
      },

      /**
       * The class name of custom Finish button
       */
      drawFinishCls: {
        type: String,
        value: 'leaflet-pm-icon-checkmark'
      }
    },

    addInst(parent) {
      PxMapBehavior.LeafletRootImpl.addInst.call(this, parent);
      // add the controls
      this._addControls(this.drawToolbarPosition, this.drawControls, this.drawToolbarLanguage);
      // hide the controls if showDrawToolbar = false
      if (!this.showDrawToolbar) {
        this.elementInst.pm.toggleControls();
      }
    },

    removeInst() {
      this._removeControls();
      PxMapBehavior.LeafletRootImpl.removeInst.call(this);
    },

    updateInst(lastOptions, nextOptions) {
      if (lastOptions.showDrawToolbar !== nextOptions.showDrawToolbar) {
        this.elementInst.pm.toggleControls();
        this._removeDrawnLayers();
      }
      if(lastOptions.drawToolbarPosition !== nextOptions.drawToolbarPosition) {
        this._updateControlsPosition(nextOptions.drawToolbarPosition);
      }
      if(lastOptions.drawToolbarLanguage !== nextOptions.drawToolbarLanguage) {
        this.elementInst.pm.setLang(nextOptions.drawToolbarLanguage);
      }

      PxMapBehavior.LeafletRootImpl.updateInst.call(this, lastOptions, nextOptions);
    },

    getInstOptions() {
      const options = PxMapBehavior.LeafletRootImpl.getInstOptions.call(this);
      options.drawToolbarPosition = this.drawToolbarPosition;
      options.showDrawToolbar = this.showDrawToolbar;
      options.drawToolbarLanguage = this.drawToolbarLanguage;
      options.drawControls = this.drawControls;

      return options;
    },

    /**
     * Add the controls to drawing toolbar and bind the events
     * @param {*} position
     * @param {*} drawControls
     * @param {*} language
     */
    _addControls(position, drawControls, language) {
      // ignore all other shapes/layers which are not generated/drawn by leaflet-geoman
      L.PM.setOptIn(true);

      // make sure the this.elementInst.pm is initialized
      if (!this.elementInst.pm) {
        this.elementInst.pm = new L.PM.Map(this.elementInst);
      }

      // adds the draw/edit buttons
      const options = Object.assign({position: position}, drawControls);
      this.elementInst.pm.addControls(options);

      // bind events
      const layerCreatedFn = this._handleShapeLayerCreated.bind(this);
      const layerDrawEndFn = this._handleShapeLayerDrawEnd.bind(this);
      const layerRemovedFn = this._handleShapeLayerRemoved.bind(this);
      const removalModeToggledFn = this._handleRemovalModeToggled.bind(this);
      this.bindEvents({
        'pm:create' : layerCreatedFn,
        'pm:drawend' : layerDrawEndFn,
        'pm:remove' : layerRemovedFn,
        'pm:globalremovalmodetoggled': removalModeToggledFn
      });

      // creates custom button
      const drawFinishedFn = this._handleDrawFinished.bind(this);
      this.finishBtn = this.elementInst.pm.Toolbar.createCustomControl({
        name: 'customFinish',
        block: 'custom',
        title: this.drawFinishTitle,
        onClick: drawFinishedFn,
        toggle: false,
        disabled: true,
        className: this.drawFinishCls
      });

      // set language
      this.elementInst.pm.setLang(language);
      // disable controls' submenu/actions
      this._disableActionsForControls();
    },

    /**
     * Disable/remove the submenu/actions for controls
     */
    _disableActionsForControls() {
      this.elementInst.pm.Toolbar.changeActionsOfControl('Rectangle', []);
      this.elementInst.pm.Toolbar.changeActionsOfControl('Polygon', []);
      this.elementInst.pm.Toolbar.changeActionsOfControl('Circle', []);

      this.elementInst.pm.Toolbar.changeActionsOfControl('Cut', []);
      this.elementInst.pm.Toolbar.changeActionsOfControl('editMode', []);
      this.elementInst.pm.Toolbar.changeActionsOfControl('dragMode', []);
      this.elementInst.pm.Toolbar.changeActionsOfControl('removalMode', []);
    },

    /**
     * Remove the controls and drawn layers
     */
    _removeControls() {
      // remove all drawn layers
      this._removeDrawnLayers();
      this.elementInst.pm.removeControls();
    },

    /**
     * Remove the drawn layers
     */
    _removeDrawnLayers() {
      // remove all drawn layers
      const layers = this.elementInst.pm.getGeomanDrawLayers();
      layers.forEach(layer => layer.remove());
      // remove the drawing layer
      this.elementInst.pm.disableDraw();
      // disable the Finish button
      this._toggleFinishBtnEnalbeState(false);

      this.fire('px-map-drawn-layer-changed', { hasDrawnLayers: false });
    },

    /**
     * Whether has drawn layers
     */
    _hasDrawnLayers() {
      const layers = this.elementInst.pm.getGeomanDrawLayers();
      return layers && layers.length > 0;
    },

    /**
     * Enalbe/Disable the custom Finish button
     * @param {*} enable
     */
    _toggleFinishBtnEnalbeState(enable) {
      this.elementInst.pm.Toolbar.setButtonDisabled('customFinish', !enable);
      if (this.finishBtn) {
        const btnContainer = this.finishBtn.getContainer();
        const btnIcon = this.finishBtn.buttonsDomNode.getElementsByClassName('control-icon')[0];
        if (enable) {
          btnContainer.classList.add('blue-border');
          btnIcon.classList.add('leaflet-pm-icon-checkmark-blue');
        } else {
          btnContainer.classList.remove('blue-border');
          btnIcon.classList.remove('leaflet-pm-icon-checkmark-blue');
        }
      }
    },

    /**
     * Enable/Disable the shape buttons
     *
     * @param {*} enable
     */
    _toggleShapeBtnsEnableState(enable) {
      this.elementInst.pm.Toolbar.setButtonDisabled('Rectangle', !enable);
      this.elementInst.pm.Toolbar.setButtonDisabled('Polygon', !enable);
      this.elementInst.pm.Toolbar.setButtonDisabled('Circle', !enable);
    },

    /**
     * Update the drawing toolbar position
     * @param {*} position
     */
    _updateControlsPosition(position) {
      this.elementInst.pm.Toolbar.setBlockPosition('draw', position);
      this.elementInst.pm.Toolbar.setBlockPosition('edit', position);
      this.elementInst.pm.Toolbar.setBlockPosition('custom', position);
    },

    /**
     * Bind the events for new added layers
     * @param {*} layer
     */
    _bindLayerEvents(layer) {
      // listen edit event of new added layer
      layer.on('pm:edit', evt => {
        this._toggleFinishBtnEnalbeState(true);
      });

      layer.on('pm:cut', evt => {
        this._bindLayerEvents(evt.layer);
      });
    },

    /**
     * Handle when the layer or shape is drawn/created.
     * @param {*} e
     */
    _handleShapeLayerCreated(e) {
      // listen edit/cut event of new added layer
      this._bindLayerEvents(e.layer);

      // marke the layers drawn by leaflet-geoman editable
      e.layer.setStyle({ pmIgnore: false });
      e.layer.options.pmIgnore = false;
      L.PM.reInitLayer(e.layer);
    },

    /**
     * Handle when the layer or shape is draw ended.
     *
     * @param {*} e
     */
    _handleShapeLayerDrawEnd(e) {
      // drawend event is triggerred as well when disable the draw for the first shape/layer
      // can't use hasLayers = true directly here
      const hasLayers = this._hasDrawnLayers();
      this._toggleFinishBtnEnalbeState(hasLayers);
      this.fire('px-map-drawn-layer-changed', { hasDrawnLayers: hasLayers });
    },

    /**
     * Handle when the layer or shape is removed.
     * @param {*} e
     */
    _handleShapeLayerRemoved(e) {
      const hasLayers = this._hasDrawnLayers();
      this._toggleFinishBtnEnalbeState(hasLayers);
      this.fire('px-map-drawn-layer-changed', { hasDrawnLayers: hasLayers });
    },

    /**
     * Handle the event when the layer is drawn/edited/removed/cutted etc.
     * Return the feature colletion of drawn polygons
     *
     * @param {*} evt
     */
    _handleDrawFinished(evt) {
      const group = L.featureGroup();
      const layers = this.elementInst.pm.getGeomanDrawLayers();
      layers.forEach((layer) => {
        if (layer instanceof L.Circle) {
          // convert the circle layer to polygon layer
          group.addLayer(L.PM.Utils.circleToPolygon(layer));
        } else {
          group.addLayer(layer);
        }
      });

      this.fire('px-map-draw-finished', group.toGeoJSON());
      this._toggleFinishBtnEnalbeState(false);
      this.elementInst.pm.disableGlobalRemovalMode();
    },

    /**
     * Handle the event when removal mode is toggled.
     *
     * @param {*} evt
     */
    _handleRemovalModeToggled(evt) {
      this.fire('px-map-removal-mode-changed', {removalEnabled: this.elementInst.pm.globalRemovalModeEnabled()});
    }
    /**
     * Fired when user clicking on the custom Finish button.
     *
     *   * {Object} detail - Contains the event details, the feature colletion of drawn polygons.
     *
     * @event px-map-draw-finished
     */

    /**
     * Fired when the layer is added/removed.
     *
     *   * {Object} detail - Contains the event details - flag to indicate still has drawn layers or not.
     *
     * @event px-map-drawn-layer-changed
     */

    /**
     * Fired when the removal mode is toggled.
     *
     *   * {Object} detail - Contains the event details - removal is enable or not.
     *
     * @event px-map-removal-mode-changed
     */
  };

  /**
   *
   * @polymerBehavior PxMapBehavior.LeafletRoot
   */
  PxMapBehavior.LeafletRootImpl = {
    properties: {
      /**
       * The coordinate reference system to use when projecting geographic points
       * into pixel coordinates. Can only be set once before the map is first
       * initialized. If you don't know what this is, do not set it and the map
       * will default to the most common web mapping projection (EPSG3857).
       *
       * @type {L.CRS}
       */
      crs: {
        type: Object
      },

      /**
       * The latitude of the active map center. Can be used to set or update
       * the center of the map, or read from after the user moves the map to
       * get updated coordinates.
       *
       * @type {Number}
       */
      lat: {
        type: Number,
        value: 37.7672375,
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * The longitude of the active map center. Can be used to set or update
       * the center of the map, or read from after the user moves the map to
       * get updated coordinates.
       *
       * @type {Number}
       */
      lng: {
        type: Number,
        value: -121.9584131,
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * The zoom level of the active map. Can be used to set or update
       * the zoom level of the map, or read from after the user changes the
       * map zoom level to an updated value.
       *
       * @type {Number}
       */
      zoom: {
        type: Number,
        value: 10,
        notify: true,
        observer: 'shouldUpdateInst'
      },

      /**
       * The maximum zoom level for the active map (the furthest the user can
       * zoom in). Setting it at the map level will take precedence over the
       * max zoom of all other layers, including tile layers. If you need to
       * set different zoom bounds based on the visible tile layer, set the
       * max zoom directly on your tile layer.
       *
       * @type {Number}
       */
      maxZoom: {
        type: Number,
        observer: 'shouldUpdateInst'
      },

      /**
      * The minimum zoom level for the active map (the furthest the user can
      * zoom out). Setting it at the map level will take precedence over the
      * min zoom of all other layers, including tile layers. If you need to
      * set different zoom bounds based on the visible tile layer, set the
      * min zoom directly on your tile layer.
       *
       * @type {Number}
       */
      minZoom: {
        type: Number,
        observer: 'shouldUpdateInst'
      },

      /**
       * Restricts the user from moving the map outside of a specific geographic
       * boundary. The user will be bounced back if they attempt to pan outside the view.
       * Disabled by default, letting the user pan to any point on the map.
       *
       * Pass an array of [lat,lng] values like the following:
       *
       *        [[40.712, -74.227], [40.774, -74.125]]
       *
       * The first pair should represent the southwest extend of the boundary,
       * and the second  pair should represent the northeast extend of the
       * boundary.
       *
       * @type {Array}
       */
      maxBounds: {
        type: Array,
        observer: 'shouldUpdateInst'
      },

      /**
       * Set to disable dragging of the map with the mouse or by touch. Use to
       * restrict changing the map's visible area (e.g. for a static map) or
       * to set up a map for being updated programmatically (e.g. through regular
       * responses from an API).
       *
       * @type {Boolean}
       */
      disableDragging: {
        type: Boolean,
        value: false,
        observer: 'shouldUpdateInst'
      },

      /**
       * Set to disable zooming with the scroll wheel. Useful if you have a map
       * that takes up the full width of a page and want to allow the user to
       * scroll/swipe past without getting stuck in a zoom-in-zoom-out loop.
       *
       * @type {Boolean}
       */
      disableScrollZoom: {
        type: Boolean,
        value: false,
        observer: 'shouldUpdateInst'
      },

      /**
       * Set to disable the two-finger zoom gesture on touch devices.
       *
       * @type {Boolean}
       */
      disableTouchZoom: {
        type: Boolean,
        value: false,
        observer: 'shouldUpdateInst'
      },

      /**
       * Set to disable zooming on double-click.
       *
       * @type {Boolean}
       */
      disableDoubleClickZoom: {
        type: Boolean,
        value: false,
        observer: 'shouldUpdateInst'
      },

      /**
       * Set to disable the attribution control, which can be used to show the
       * source of tile layers or other data overlays.
       *
       * This property is not dynamic and can only be set once when the map is
       * first initialized.
       *
       * @type {Boolean}
       */
      disableAttribution: {
        type: Boolean,
        value: false
      },

      /**
       * Stringified HTML that will be used as the first item in your attribution
       * list. Pass an <a> tag with a link to more information about your
       * attribution source. Example: '<a href="https://example.com">Example</a>'
       *
       * Defaults to a link to the Leaflet.js library. If an empty string is
       * passed ("") the prefix will be hidden.
       *
       * @type {String}
       */
      attributionPrefix: {
        type: String,
        value: '<a href="http://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>',
        observer: 'shouldUpdateInst'
      },

      /**
       * Uses flexbox to set the size of the map. Set the parent container
       * to use `display: flex;` in your CSS and the map will automatically
       * fill the container's available height and width.
       *
       * @type {Boolean}
       */
      flexToSize: {
        type: Boolean,
        reflectToAttribute: true,
        value: false
      }
    },

    attached() {
      this.listen(this, 'px-map-element-ready-to-add', 'shouldAddInst');

      if (Polymer.Element) {
        this._afterFirstRender = false;
        Polymer.RenderStatus.afterNextRender(this, () => {
          this._afterFirstRender = true;
          if (this.canAddInst()) {
            this.fire('px-map-element-ready-to-add');
          }
        });
      }
      else {
        this._afterFirstRender = true;
      }

      if (this.canAddInst()) {
        this.fire('px-map-element-ready-to-add');
      }
    },

    detached() {
      this.unlisten(this, 'px-map-element-ready-to-add', 'shouldAddInst');
      this.shouldRemoveInst();
      this.removeInst();
    },

    shouldAddInst(evt) {
      if (Polymer.dom(evt).rootTarget !== this) return;

      PxMapBehavior.ElementImpl.shouldAddInst.call(this);
      this.addInst();
    },

    canAddInst() {
      if (typeof this.zoom !== 'undefined' && this._canBeNum(this.zoom) && this._afterFirstRender) {
        return this.latLngIsValid(this.lat, this.lng, true);
      }
    },

    createInst(options) {
      const mapEl = Polymer.dom(this.root).querySelector('#map');
      const mapInst = L.map(mapEl, options);

      mapInst.attributionControl.setPrefix(options.attributionPrefix);

      if (this.isShadyScoped()) {
        mapInst.__addShadyScope = this.scopeSubtree.bind(this);
      }
      return mapInst;
    },

    addInst() {
      // @TODO: This is a shim for browsers without shadow DOM. We need to
      // re-append the `#map` element or it won't get the 'style-scope' CSS
      // classes needed to style it or its children. That's bad. When the
      // polyfill is updated or support is cut for browsers without shadow
      // DOM, this should be removed.
      if (this.isShadyScoped()) {
        this.scopeSubtree(this.$.map, true);
      }

      // Bind custom events for the map intance. Events will be unbound automatically.
      const mapMoveFn = this._handleMapMove.bind(this);
      const zoomStartFn = this._handleZoomStart.bind(this);
      const zoomEndFn = this._handleZoomEnd.bind(this);
      this.bindEvents({
        'moveend' : mapMoveFn,
        'zoomstart' : zoomStartFn,
        'zoomend' : zoomEndFn
      });
    },

    removeInst() {
      // Stop watching the shady root map element for changes
      if (this.isShadyScoped()) {
        this.scopeSubtree(this.$.map, false);
      }
    },

    getInstOptions() {
      const options = {};

      // Static options
      options.zoomControl = false;

      // Dynamic options
      options.crs = this.crs || L.CRS.EPSG3857;
      options.center = [this.lat, this.lng];
      options.zoom = this.zoom;
      options.minZoom = this.minZoom || 0;
      options.maxZoom = this.maxZoom || 18;
      options.maxBounds = this.maxBounds || undefined;

      options.dragging = !this.disableDragging;
      options.scrollWheelZoom = !this.disableScrollZoom;
      options.touchZoom = !this.disableTouchZoom;
      options.doubleClickZoom = !this.disableDoubleClickZoom;
      options.attributionControl = !this.disableAttribution;
      options.attributionPrefix = this.attributionPrefix;

      return options;
    },

    updateInst(lastOptions, nextOptions) {
      if ((this.latLngIsValid(nextOptions.center[0], nextOptions.center[1])) &&
          (lastOptions.center[0] !== nextOptions.center[0] ||
          lastOptions.center[1] !== nextOptions.center[1] ||
          lastOptions.zoom !== nextOptions.zoom)) {
        this._updateMapView();
      }

      if (lastOptions.maxZoom !== nextOptions.maxZoom && !isNaN(nextOptions.maxZoom)) {
        this.elementInst.setMaxZoom(nextOptions.maxZoom);
      }
      if (lastOptions.minZoom !== nextOptions.minZoom && !isNaN(nextOptions.minZoom)) {
        this.elementInst.setMinZoom(nextOptions.minZoom);
      }
      if (lastOptions.maxBounds !== nextOptions.maxBounds && !isNaN(nextOptions.maxBounds)) {
        this.elementInst.setMaxBounds(nextOptions.maxBounds);
      }

      if (!lastOptions.dragging && nextOptions.dragging) {
        this.elementInst.dragging.enable();
      }
      if (lastOptions.dragging && !nextOptions.dragging) {
        this.elementInst.dragging.disable();
      }

      if (!lastOptions.scrollWheelZoom && nextOptions.scrollWheelZoom) {
        this.elementInst.scrollWheelZoom.enable();
      }
      if (lastOptions.scrollWheelZoom && !nextOptions.scrollWheelZoom) {
        this.elementInst.scrollWheelZoom.disable();
      }

      if (!lastOptions.touchZoom && nextOptions.touchZoom) {
        this.elementInst.touchZoom.enable();
      }
      if (lastOptions.touchZoom && !nextOptions.touchZoom) {
        this.elementInst.touchZoom.disable();
      }

      if (!lastOptions.doubleClickZoom && nextOptions.doubleClickZoom) {
        this.elementInst.doubleClickZoom.enable();
      }
      if (lastOptions.doubleClickZoom && !nextOptions.doubleClickZoom) {
        this.elementInst.doubleClickZoom.disable();
      }

      if (lastOptions.attributionPrefix !== nextOptions.attributionPrefix) {
        this.elementInst.attributionControl.setPrefix(nextOptions.attributionPrefix);
      }
    },

    /**
     * Checks if the map container has changed size or visibility, and - if so -
     * updates the map accordingly by refreshing the tile layer.
     */
    invalidateSize() {
      if (!this.elementInst) return;

      this.elementInst.invalidateSize();
    },

    /**
     * Called when the `lat`, `lng`, or `zoom` properties are set or updated.
     * Sets the map view to the new values.
     */
    _updateMapView() {
      if (!this.elementInst) return;

      this.debounce('update-map-view', function() {
        const {lat, lng} = this.elementInst.getCenter();
        const zoom = this.elementInst.getZoom();

        if (this.lat !== lat || this.lng !== lng || this.zoom !== zoom) {
          this.elementInst.setView([this.lat,this.lng], this.zoom);
        }
      });
    },

    /**
     * Returns true if val can be used as a number in L.LatLng or zoom
     *
     * @param {*} val
     * @return {Boolean}
     */
    _canBeNum(val) {
      return (!isNaN(val) && val !== "");
    },

    /**
     * Returns true if lat and lng are valid values that can be used to set a
     * map's position. Prints an error if values are invalid (unless `hideError`
     * is set to true).
     *
     * @param {Number} lat
     * @param {Number} lng
     * @param {Boolean} hideError
     * @return {Boolean}
     */
    latLngIsValid(lat, lng, hideError) {
      var isValid = (typeof lat !== 'undefined' && this._canBeNum(lat)) && (typeof lng !== 'undefined' && this._canBeNum(lng));
      if (isValid) return true;
      if (!hideError) {
        console.log(`PX-MAP CONFIGURATION ERROR:
          You entered an invalid \`lat\` or \`lng\` attribute for ${this.is}. You must pass a valid number.`);
      }
      return false;
    },

    /**
     * Called when the map itself is moved (either by user interaction or by
     * some other method programmatically setting geometry properties).
     *
     * Syncs the new lat, lng, and zoom to the map's properties and notifies
     * out the result.
     */
    _handleMapMove() {
      if (this.__isZooming) {
        this.__onZoomEnd = this._handleMapMove.bind(this);
        return;
      }

      this.debounce('handle-map-move', function() {
        const latLng = this.elementInst.getCenter();
        const zoom = this.elementInst.getZoom();
        const bounds = this.elementInst.getBounds();

        if (this.lat !== latLng.lat || this.lng !== latLng.lng) {
          this.set('lat', latLng.lat);
          this.set('lng', latLng.lng);
        }
        if (this.zoom !== zoom) {
          this.set('zoom', zoom);
        }

        this.fire('px-map-moved', {
          lat: latLng.lat,
          lng: latLng.lng,
          zoom: zoom,
          bounds: bounds
        });
      });
    },
    /**
     * Fired when the map's centerpoint (lat/lng) or zoom is changed by the user
     * or programatically.
     *
     *   * {Object} detail - Contains the event details
     *   * {Number} detail.lat - Latitude of the map centerpoint after moving
     *   * {Number} detail.lng - Longitude of the map centerpoint after moving
     *   * {Number} detail.zoom - Zoom level of the map after moving
     *   * {L.LatLngBounds} detail.bounds - Custom Leaflet object describing
     *     the visible bounds of the map as a rectangle
     *
     * @event px-map-moved
     */

     /**
      * Sets an internal boolean that allows us to wait before handling any map
      * movements until the zoom animation is over.
      */
    _handleZoomStart() {
      this.__isZooming = true;
    },

    /**
     * Sets an internal boolean that allows us to wait before handling any map
     * movements until the zoom animation is over.
     */
    _handleZoomEnd() {
      this.__isZooming = false;
      if (typeof this.__onZoomEnd === 'function') {
        this.__onZoomEnd();
        this.__onZoomEnd = null;
      }
    },

    /**
     * Iterates over all markers attached to the map and returns an array of markers
     * that are within the visible bounds. Use to discover which markers the
     * user can currently see and change/filter the state of your app.
     *
     * This is an expensive operation, particularly for maps with many markers
     * (e.g. in a marker group). Only call it when necessary.
     *
     * To get continuous updates on which markers are visible, attach a
     * `px-map-moved` event listener to this element and call this method
     * after each moved event.
     *
     * @return {Array}
     */
    getVisibleMarkers() {
      const mapBounds = this.elementInst.getBounds();
      let markers = [];

      // Loop over the layers
      this.elementInst.eachLayer((layer) => {
        // Most markers should have an `isMarker` static property defined as `true`
        // and a `getLatLng` method
        if (layer.isMarker && layer.getLatLng) {
          // Only push markers that are visible
          if (mapBounds.contains(layer.getLatLng()) && markers.indexOf(layer) === -1) {
            markers.push(layer);
          }
        }

        // Marker clusters have a `_markerCluster` key
        if (layer._markerCluster) {
          layer.eachLayer((marker) => {
            // Only push markers that are visible
            let parentCluster = layer.getVisibleParent(marker);
            if (parentCluster && mapBounds.contains(parentCluster.getLatLng()) && marker && markers.indexOf(marker) === -1) {
              markers.push(marker);
            }
          })
        }
      });

      return markers;
    }
  };
  /* Bind Popup behavior */
  /** @polymerBehavior */
  PxMapBehavior.LeafletRoot = [
    PxMapBehavior.Element,
    PxMapBehavior.ParentLayer,
    PxMapBehavior.LeafletRootImpl,
    PxMapBehavior.DrawToolbarImpl,
    PxMapBehavior.TrackMarkersImpl
  ];
})();
