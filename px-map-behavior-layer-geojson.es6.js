
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

 (function () {
  /** **************************************************************************
   * BEHAVIORS
   *************************************************************************** */

  /* Ensures the behavior namespace is created */
  window.PxMapBehavior = (window.PxMapBehavior || {});

  /**
   *
   * @polymerBehavior PxMapBehavior.
   */
  PxMapBehavior.GeoJSONLayerImpl = {
    properties: {
      /**
       * An object formatted as a GeoJSON FeatureCollection with one or more Features.
       * Each feature can be formatted as any valid GeoJSON geometry type: Point,
       * LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon,
       * or GeometryCollection. See the [GeoJSON spec](http://geojson.org/geojson-spec.html)
       * for guidance on generating valid GeoJSON.
       *
       * Each feature should contain a `properties` object that can hold metadata
       * about the feature. Optionally, the feature's `properties.style` can be
       * set to an object that will be used to style the feature when it is drawn.
       * Styles set in a feature's `properties.style` will override the styles
       * set in the `featureStyle` attribute. See the `featureStyle` attribute
       * documentation for a list of available style options.
       *
       * @type {Object}
       */
      data: {
        type: Object,
        observer: 'shouldUpdateInst',
      },

      /**
       * An object with settings that will be used to style each feature when
       * it is added to the map. The following options are available:
       *
       * - {Boolean} `stroke`: [default=true] Set to false to disable borders on polygons/circles
       * - {String} `color`: [default=$primary-blue] Color for polygon/circle borders
       * - {Number} `weight`: [default=2] Weight for polygon/circle borders in pixels
       * - {Number} `opacity`: [default=1.0] Opacity for polygon/circle borders
       * - {Boolean} `fill`: [default=true] Set to false to disable filling polygons/circles
       * - {String} `fillColor`: [default=$dv-light-blue] Color for polygon/circle fill
       * - {Number} `fillOpacity`: [default=0.4] Opacity for polygon/circle fill
       * - {String} `fillRule`: [default='evenodd'] Defines how the [inside of a shape](https://developer.mozilla.org/docs/Web/SVG/Attribute/fill-rule) is determined
       * - {String} `lineCap`: [default='round'] Defines the [shape to be used](https://developer.mozilla.org/docs/Web/SVG/Attribute/stroke-linecap) at the end of the stroke
       * - {String} `lineJoin`: [default='round'] Defines the [shape to be used](https://developer.mozilla.org/docs/Web/SVG/Attribute/stroke-linejoin) at the corner of a stroke
       * - {String} `dashArray`: [default=null] Defines the stroke [dash pattern](https://developer.mozilla.org/docs/Web/SVG/Attribute/stroke-dasharray)
       * - {String} `dashOffset`: [default=null] Defines the [distance into the dash to start the dash](https://developer.mozilla.org/docs/Web/SVG/Attribute/stroke-dashoffset)
       *
       * Note that styles can also be added to each feature individually (see
       * the `data` attribute documentation). Styles defined on each feature will
       * override the `featureStyle`.
       *
       * @type {Object}
       */
      featureStyle: {
        type: Object,
        observer: 'shouldUpdateInst',
      },

      /**
       * If set, a popup containing a feature's properties will be opened when
       * the user taps that feature. The following properties will be filtered
       * out: the property key `style` and its value; any properties with the
       * value "unset" as a string.
       *
       * Note: A data-style popup will be used. This popup currently cannot be
       * configured and will use its default configuration.
       *
       * @type {Boolean}
       */
      showFeatureProperties: {
        type: Boolean,
        value: false,
        observer: 'shouldUpdateInst',
      },

      /**
       * Programatically highlights the selected route/segment and is updated when the
       * user updates route/segment.
       */
      selectedFeature: {
        type: String,
        value: null,
        observer: 'shouldUpdateInst',
        notify: true
      },
    },

    /**
     * Forces the GeoJSON layer to deeply check the `data` attribute for differences
     * in the data from the last draw, and make any necessary updates. Call this
     * method if you are passing an object by reference to `data` and making deep
     * updates that don't trigger property observers.
     *
     * @return {undef}
     */
    update() {
      if (!this.elementInst) return;

      this.shouldUpdateInst();
    },

    canAddInst() {
      return this.data && typeof this.data === 'object' && Object.keys(this.data).length;
    },

    // extends the layer `addInst` method to harvest and fire events
    addInst(parent) {
      // Bind custom events. Events will be unbound automatically.
      const addedFn = this._handleFeatureAdded.bind(this);
      const removedFn = this._handleFeatureRemoved.bind(this);
      this.bindEvents({
        layeradd: addedFn,
        layerremove: removedFn,
      });

      // If any layers already added before events bound, manually fire layer
      // added events to attach listeners/notify the world the layer is added
      if (this.elementInst.getLayers().length !== 0) {
        this.elementInst.eachLayer((layer) => {
          this.elementInst.fire('layeradd', { layer });
        });
      }

      // Now call layer's add
      PxMapBehavior.LayerImpl.addInst.call(this, parent);
      // create map element instance and an handler to click
      const pxMapEl = document.getElementsByTagName('px-map')[0];
      pxMapEl.elementInst.on('click', this._handleMapClick.bind(this));

    },

    _handleMapClick(evt) {
      // reset selectedFeature prop upon map click
      this.selectedFeature = null;

      // callback prop to user upon map click
      this.fire('px-map-clicked', this._tappedFeature || evt);
      this._tappedFeature = null;
    },

    createInst(options) {
      const styleAttributeProperties = this.getInstOptions().featureStyle;

      const geojsonLayer = L.geoJson(options.data, {
        pointToLayer: (feature, latlng) => {
          const featureProperties = feature.properties && feature.properties.style || {};
          const attributeProperties = options.featureStyle;
          const style = this._getStyle(feature, featureProperties, attributeProperties);

          return new L.CircleMarker(latlng, style);
        },

        style: (feature) => {
          const featureProperties = feature.properties && feature.properties.style || {};

          return this._getStyle(featureProperties, styleAttributeProperties);
        },
      });

      return geojsonLayer;
    },

    _getStyle(featureProperties, attributeProperties) {
      return {
        radius: featureProperties.radius || attributeProperties.radius || 5,
        color: featureProperties.color || attributeProperties.color || '#3E87E8', // primary-blue,
        fillColor: featureProperties.fillColor || attributeProperties.fillColor || '#88BDE6', // $dv-light-blue
        weight: featureProperties.weight || attributeProperties.weight || 7,
        opacity: featureProperties.opacity || attributeProperties.opacity || 1,
        fillOpacity: featureProperties.fillOpacity || attributeProperties.fillOpacity || 0.4,
      };
    },

    _bindFeaturePopups() {
      if (!this.elementInst) return;
      this.elementInst.eachLayer(layer => this._bindPopup(layer.feature, layer));
    },

    _bindPopup(feature, layer) {
      const customPopup = feature.customPopup;
      if (customPopup) {
        const popup = new PxMap.InfoPopup(JSON.parse(JSON.stringify(customPopup)));
          //wait until the map layer render
          setTimeout(() => {
            layer.bindPopup(popup).openPopup();
          }, 0);
      }

      // Filter keys to remove info that should not be displayed in a popup.
      // If no keys remain, do not bind a popup.
      const popupDataKeys = Object.keys(feature.properties).filter(key => feature.properties.hasOwnProperty(key) && feature.properties[key] !== 'unset' && key !== 'style' && key !== 'selectedStyle');
      if (!popupDataKeys.length) return;

      const popupData = popupDataKeys.reduce((accum, key) => {
        accum[key] = feature.properties[key];
        return accum;
      }, {});

      const popup = new PxMap.DataPopup({
        title: 'Feature Properties',
        data: popupData,
        autoPanPadding: [1, 1],
      });

      if (customPopup) return;
      //wait until the map layer render
      setTimeout(() => {
        layer.bindPopup(popup).openPopup();
      }, 0);
    },

    _unbindFeaturePopups() {
      if (!this.elementInst) return;
      this.elementInst.eachLayer(layer => this._unbindPopup(layer));
    },

    _unbindPopup(layer) {
      if (typeof layer.getPopup() !== 'undefined') {
        layer.unbindPopup();
      }
    },

    /*
     * Update the instance if the new data is not the same as the old OR if the
     * new style is not the same as the old. (Stringifying is needed here to be
     * able to do a deep equality check).
     */
    updateInst(lastOptions, nextOptions) {
      if (!Object.keys(nextOptions.data).length) {
        this.elementInst.clearLayers();
      } else if (Object.keys(nextOptions.data).length &&
        (lastOptions.dataHash !== nextOptions.dataHash ||
          lastOptions.featureStyleHash !== nextOptions.featureStyleHash ||
          this.selectedFeature ||
          lastOptions.selectedFeature)) {
        const styleAttributeProperties = this.getInstOptions().featureStyle;

        // toggle highlight selected feature
        const geoData = this._toggleHighlightSelectedFeature(nextOptions);

        this.elementInst.clearLayers();
        this.elementInst.options.style = (feature) => {
          const featureProperties = feature.properties.style || {};
          return this._getStyle(featureProperties, styleAttributeProperties);
        };

        this.elementInst.addData(geoData);
        if (nextOptions.showFeatureProperties) {
          this.elementInst.eachLayer(layer => {
            // bind and open popup of selected feature
            if(layer.feature.id === this.selectedFeature) {
              this._bindPopup(layer.feature, layer)
            }
          });
        }
      } else if (lastOptions.showFeatureProperties !== nextOptions.showFeatureProperties) {
        if (nextOptions.showFeatureProperties) this._bindFeaturePopups();
        if (!nextOptions.showFeatureProperties) this._unbindFeaturePopups();
      }
    },

    getInstOptions() {
      return {
        data: this.data || {},
        dataHash: JSON.stringify(this.data || {}),
        featureStyle: this.featureStyle || {},
        featureStyleHash: JSON.stringify(this.featureStyle || {}),
        showFeatureProperties: this.showFeatureProperties,
        selectedFeature: this.selectedFeature,
      };
    },

    _toggleHighlightSelectedFeature(nextOptions) {
      // un-highlight when no selectedFeature
      if (this.selectedFeature === null || nextOptions.data.highlightOnSelected === false) {
        return nextOptions.data;
      }

      const geoData = JSON.parse(JSON.stringify(nextOptions.data));
      let objectToAppendWeight = {};
      let objectToAppendHighlight = {};
      let objectToAppendColor = {};
      let featureToHighlight;
      geoData.features.map((feature) => {
        if (feature.id === this.selectedFeature) {
          featureToHighlight = feature;
        }
      });

      // just return original data when there is no matching id found(no route is highlighted)
      if(!featureToHighlight) {
        return geoData;
      }

      if (featureToHighlight.properties.selectedStyle) {
        const border = JSON.parse(JSON.stringify(featureToHighlight));
        const fill = JSON.parse(JSON.stringify(featureToHighlight));
        const selectedStyle = featureToHighlight.properties.selectedStyle;

        border.properties.style = {
          weight: selectedStyle.borderWidth,
          opacity: selectedStyle.borderOpacity,
          color: selectedStyle.borderColor,
        };
        border.isBorder = true;
        border.isHighlighted = true;

        fill.properties.style = {
          weight: selectedStyle.fillWidth,
          opacity: selectedStyle.fillOpacity,
          color: selectedStyle.fillColor,
        };
        fill.isHighlighted = true;

        geoData.features.push(border);
        geoData.features.push(fill);
      } else {
        objectToAppendWeight = JSON.parse(JSON.stringify(featureToHighlight));
        objectToAppendHighlight = JSON.parse(JSON.stringify(featureToHighlight));
        objectToAppendColor = JSON.parse(JSON.stringify(featureToHighlight));

        // default to primary-blue in case feature doesn't have style color
        const segmentDefaultColor = featureToHighlight.properties &&
          featureToHighlight.properties.style &&
          featureToHighlight.properties.style.color || '#3E87E8'; // primary-blue,

        objectToAppendWeight.properties.style = {
          weight: 7,
          opacity: 0.7,
          color: segmentDefaultColor
        };

        objectToAppendHighlight.properties.style = {
          weight: 7,
          color: 'rgba(0, 0, 0, 0.5)',
        };

        objectToAppendColor.properties.style = {
          weight: 1,
          opacity: 1,
          color: 'white',
        };

        geoData.features.push(objectToAppendWeight);
        geoData.features.push(objectToAppendHighlight);
        geoData.features.push(objectToAppendColor);
      }
      return geoData;
    },

    _handleFeatureAdded(evt) {
      if (!evt || !evt.layer) return;

      // Bind layer click events
      evt.layer.on('click', this._handleFeatureTapped.bind(this));
      evt.layer.on('popupopen', this._handleFeaturePopupOpened.bind(this));
      evt.layer.on('popupclose', this._handleFeaturePopupClosed.bind(this));
      evt.layer.on('mouseover', this._handleFeatureMouseOver.bind(this));
      evt.layer.on('mouseout', this._handleFeatureMouseOut.bind(this));

      const detail = {};
      if (evt.layer && evt.layer.feature) {
        detail.feature = evt.layer.feature;
      }
      this.fire('px-map-layer-geojson-feature-added', detail);
    },
    /**
     * Fired when a feature is attached the map. Note that every feature is
     * added/removed when any part of the `data` attribute is updated.
     *
     *   * {Object} detail - Contains the event details
     *   * {Object|undefined} detail.feature - Object containing the feature's GeoJSON source
     *
     * @event px-map-layer-geojson-feature-added
     */

    _handleFeatureTapped(evt) {
      if (evt.target && evt.target.feature && !evt.target.feature.isHighlighted) {
        this._tappedFeature = {
          feature: evt.target.feature,
          latlng: evt.latlng,
          routeSegmentId: evt.target.feature.id,
        };
      }
    },

    _handleFeatureMouseOver(evt) {
      const layer = evt.target;
      if (layer && layer.feature && layer.feature.isBorder !== true) {
        this.fire('px-map-layer-geojson-feature-mouse-over', {
          event: evt.originalEvent,
          routeSegmentId: layer.feature.id,
          popup: layer.feature.routePopup && layer.feature.routePopup.content,
        });
      }
    },

    _handleFeatureMouseOut(evt) {
      const layer = evt.target;
      if (layer && layer.feature && layer.feature.isBorder !== true) {
        this.fire('px-map-layer-geojson-feature-mouse-out', {
          event: evt.originalEvent,
          routeSegmentId: layer.feature.id,
          popup: layer.feature.routePopup && layer.feature.routePopup.content,
        });
      }
    },

    /**
     * Fired when a feature is tapped by the user.
     */

    _handleFeatureRemoved(evt) {
      if (!evt || !evt.layer) return;

      // Unbind layer click events
      evt.layer.off();

      const detail = {};
      if (evt.layer && evt.layer.feature) {
        detail.feature = evt.layer.feature;
      }
      this.fire('px-map-layer-geojson-feature-removed', detail);
    },
    /**
     * Fired when a feature is removed from the map. Note that every feature is
     * added/removed when any part of the `data` attribute is updated.
     *
     *   * {Object} detail - Contains the event details
     *   * {Object|undefined} detail.feature - Object containing the feature's GeoJSON source
     *
     * @event px-map-layer-geojson-feature-added
     */

    _handleFeaturePopupOpened(evt) {
      const detail = {};
      if (evt.target && evt.target.feature) {
        detail.feature = evt.target.feature;
        detail.latLng = evt.popup.getLatLng();
      }
      this.fire('px-map-layer-geojson-feature-popup-opened', detail);
    },
    /**
     * Fired when a feature's popup is opened by the user.
     *
     *   * {Object} detail - Contains the event details
     *   * {Object|undefined} detail.feature - Object containing the feature's GeoJSON source
     *
     * @event px-map-layer-geojson-feature-popup-opened
     */

    _handleFeaturePopupClosed(evt) {
      const detail = {};
      if (evt.target && evt.target.feature) {
        detail.feature = evt.target.feature;
      }
      this.fire('px-map-layer-geojson-feature-popup-closed', detail);
    },

    /**
     * Fired when a feature's popup is closed by the user.
     *
     *   * {Object} detail - Contains the event details
     *   * {Object|undefined} detail.feature - Object containing the feature's GeoJSON source
     *
     * @event px-map-layer-geojson-feature-popup-closed
     */
  };
  /* Bind GeoJSONLayer behavior */
  /** @polymerBehavior */
  PxMapBehavior.GeoJSONLayer = [
    PxMapBehavior.Layer,
    PxMapBehavior.GeoJSONLayerImpl,
  ];
}());
