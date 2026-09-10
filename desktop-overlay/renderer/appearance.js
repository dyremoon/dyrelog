(function(root) {
  "use strict";
  // Bounds match the controls; legacy values seed each independent mode once.
  var fields = {
    "barHeight": {
      "min": 0.3,
      "max": 3.5,
      "default": 1
    },
    "opacity": {
      "min": 0,
      "max": 1,
      "default": 1
    },
    "textScale": {
      "min": 0.85,
      "max": 2,
      "default": 1
    },
    "iconScale": {
      "min": 0.7,
      "max": 1.6,
      "default": 1
    },
    "secondaryTextScale": {
      "min": 0.7,
      "max": 2,
      "default": 1
    },
    "timerTextScale": {
      "min": 0.7,
      "max": 2,
      "default": 1
    },
    "miniPetTextScale": {
      "min": 0.7,
      "max": 2.2,
      "default": 1
    },
    "circleScale": {
      "min": 0.6,
      "max": 1.8,
      "default": 1
    }
  };
  var modes = {
    "bars": [
      "barHeight",
      "opacity",
      "textScale",
      "iconScale",
      "secondaryTextScale",
      "timerTextScale"
    ],
    "mini": [
      "barHeight",
      "opacity",
      "textScale",
      "iconScale",
      "secondaryTextScale",
      "timerTextScale",
      "miniPetTextScale"
    ],
    "circle": [
      "circleScale",
      "opacity",
      "iconScale",
      "textScale",
      "miniPetTextScale",
      "timerTextScale"
    ]
  };
  function key(mode, field) { return mode + field[0].toUpperCase() + field.slice(1); }
  function resolve(settings, mode) {
    var result = Object.assign({}, settings);
    Object.keys(fields).forEach(function(field) {
      var legacy = mode === 'circle' && field === 'textScale' ? 'secondaryTextScale' : field;
      var value = settings[key(mode, field)];
      if (value == null) value = settings[legacy];
      result[field] = Number.isFinite(value) ? Math.max(fields[field].min, Math.min(fields[field].max, value)) : fields[field].default;
    });
    return result;
  }
  function migrate(settings) {
    var result = Object.assign({}, settings);
    Object.keys(modes).forEach(function(mode) {
      var values = resolve(settings, mode);
      modes[mode].forEach(function(field) { result[key(mode,field)] = values[field]; });
    });
    return result;
  }
  var api = { fields: fields, modes: modes, key: key, resolve: resolve, migrate: migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Appearance = api;
})(typeof window !== 'undefined' ? window : globalThis);
