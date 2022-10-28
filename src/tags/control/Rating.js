import React from "react";
import { Rate } from "antd";
import { inject, observer } from "mobx-react";
import { types } from "mobx-state-tree";
import { StarOutlined } from "@ant-design/icons";

import RequiredMixin from "../../mixins/Required";
import PerRegionMixin from "../../mixins/PerRegion";
import InfoModal from "../../components/Infomodal/Infomodal";
import Registry from "../../core/Registry";
import { guidGenerator } from "../../core/Helpers";
import ControlBase from "./Base";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";

/**
 * The Rating tag adds a rating selection to the labeling interface. Use for labeling tasks involving ratings.
 *
 * Use with the following data types: audio, image, HTML, paragraphs, text, time series, video
 *
 * @example
 * <!--Basic labeling configuration to rate the content of a text passage -->
 * <View>
 *   <Text name="txt" value="$text" />
 *   <Rating name="rating" toName="txt" maxRating="10" icon="star" size="medium" />
 * </View>
 *
 * @name Rating
 * @meta_title Rating Tag for Ratings
 * @meta_description Customize Label Studio to add ratings to tasks with the Rating tag in your machine learning and data science projects.
 * @param {string} name                       - Name of the element
 * @param {string} toName                     - Name of the element that you want to label
 * @param {number} [maxRating=5]              - Maximum rating value
 * @param {number} [defaultValue=0]           - Default rating value
 * @param {small|medium|large} [size=medium]  - Rating icon size
 * @param {star|heart|fire|smile} [icon=star] - Rating icon
 * @param {string} hotkey                     - HotKey for changing rating value
 * @param {boolean} [required=false]          - Whether rating validation is required
 * @param {string} [requiredMessage]          - Message to show if validation fails
 * @param {boolean} [perRegion]               - Use this tag to rate regions instead of the whole object
 */
const TagAttrs = types.model({
  toname: types.maybeNull(types.string),

  maxrating: types.optional(types.string, "5"),
  icon: types.optional(types.string, "star"),
  size: types.optional(types.string, "medium"),
  defaultvalue: types.optional(types.string, "0"),

  hotkey: types.maybeNull(types.string),
});

const Model = types
  .model({
    pid: types.optional(types.string, guidGenerator),
    type: "rating",
    rating: types.maybeNull(types.number),
  })
  .views(self => ({
    selectedValues() {
      return self.rating;
    },

    get serializableValue() {
      const rating = self.selectedValues();

      if (!rating) return null;
      return { rating };
    },

    get holdsState() {
      return self.rating > 0;
    },

    get result() {
      if (self.perregion) {
        const area = self.annotation.highlightedNode;

        if (!area) return null;

        return self.annotation.results.find(r => r.from_name === self && r.area === area);
      }
      return self.annotation.results.find(r => r.from_name === self);
    },
  }))
  .actions(self => ({
    getSelectedString() {
      return self.rating + " star";
    },

    copyState(obj) {
      self.setRating(obj.rating);
    },

    needsUpdate() {
      if (self.result) self.rating = self.result.mainValue;
      else self.rating = null;
    },

    unselectAll() {},

    setRating(value) {
      self.rating = value;

      if (self.result) {
        self.result.area.setValue(self);
      } else {
        if (self.perregion) {
          const area = self.annotation.highlightedNode;

          if (!area) return null;
          area.setValue(self);
        } else {
          self.annotation.createResult({}, { rating: value }, self, self.toname);
        }
      }
    },

    updateFromResult(value) {
      self.rating = value;
    },

    requiredModal() {
      InfoModal.warning(self.requiredmessage || `Rating "${self.name}" is required.`);
    },

    increaseValue() {
      if (self.rating >= Number(self.maxrating)) {
        self.setRating(0);
      } else {
        if (self.rating > 0) {
          self.setRating(self.rating + 1);
        } else {
          self.setRating(1);
        }
      }
    },

    onHotKey() {
      return self.increaseValue();
    },

    toStateJSON() {
      if (self.rating) {
        const toname = self.toname || self.name;

        return {
          id: self.pid,
          from_name: self.name,
          to_name: toname,
          type: self.type,
          value: {
            rating: self.rating,
          },
        };
      }
    },

    fromStateJSON(obj) {
      if (obj.id) self.pid = obj.id;

      self.rating = obj.value.rating;
    },
  }));

const RatingModel = types.compose("RatingModel", ControlBase, TagAttrs, Model, RequiredMixin, PerRegionMixin, AnnotationMixin);

const HtxRating = inject("store")(
  observer(({ item, store }) => {
    let iconSize;

    if (item.size === "small") {
      iconSize = 15;
    } else if (item.size === "medium") {
      iconSize = 25;
    } else if (item.size === "large") {
      iconSize = 40;
    }

    const visibleStyle = item.perRegionVisible() ? {} : { display: "none" };

    // rc-rate component listens for keypress event and hit the star if the key is Enter
    // but it doesn't check for any modifiers, so it removes star during submit (ctrl+enter)
    // so we'll just remove focus from component at the moment any modifier pressed
    const dontBreakSubmit = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        // should be a star, because that's the only way this event can happen
        const star = document.activeElement;
        const control = e.currentTarget;

        // but we'll check that for sure
        if (control.contains(star)) star.blur();
      }
    };

    return (
      <div style={visibleStyle} onKeyDownCapture={dontBreakSubmit}>
        <Rate
          character={<StarOutlined style={{ fontSize: iconSize }} />}
          value={item.rating}
          count={Number(item.maxrating)}
          defaultValue={Number(item.defaultvalue)}
          onChange={item.setRating}
        />
        {store.settings.enableTooltips && store.settings.enableHotkeys && item.hotkey && (
          <sup style={{ fontSize: "9px" }}>[{item.hotkey}]</sup>
        )}
      </div>
    );
  }),
);

Registry.addTag("rating", RatingModel, HtxRating);

export { HtxRating, RatingModel };
