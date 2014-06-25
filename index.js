var Promise = require('bluebird');
var parseSignature = require('./signature');

module.exports = (function pocket (parent) {
  // mapping of names to lazy value functions, these functions may return
  // synchronously or return a Promise
  var lazy = {};
  // mapping of names to resolved values, wrapped in Promises.
  var values = {};
  // map of names to provider functions, these are only available to children of
  // this pocket.
  var providers = {};
  var defaults = {};
  var allNames = {};

  function addNames (fn) {
    parseSignature(fn).forEach(function (name) {
      allNames[name] = true;
    });
  }

  var self = {
    pocket: function (addStrict) {
      return pocket(self);
    },

    run: function (fn, callback) {
      var params = parseSignature(fn).map(self.get);
      return Promise.all(params).spread(fn.bind(self)).nodeify(callback);
    },

    /**
     * Precedence:
     *
     *  1. local (lazy) value
     *  2. parent (lazy) value
     *  3. parent provider
     */
    get: function (name, callback) {
      if (typeof callback === 'number') {
        // special-case handling for names.map(self.get)
        callback = void 0;
      }
      name = canonicalize(name);
      if (values[name] !== void 0) {
        return values[name].nodeify(callback);
      }

      var fn = lazy[name] || defaults[name];
      if (typeof fn === 'function') {
        values[name] = self.run(fn).nodeify(callback);
        return values[name];
      }
      else if (fn !== void 0) {
        // fn is a concrete default value
        values[name] = Promise.cast(fn).nodeify(callback);
        return values[name];
      }

      if (parent && parent.hasValue(name)) {
        return parent.get(name, callback);
      }

      var provider = parent.getProvider(name);
      if (provider) {
        values[name] = Promise.cast(self.run(provider)).nodeify(callback);
        return values[name];
      }

      var error = new Error('No provider for "' + name + '"');
      return Promise.reject(error).nodeify(callback);
    },

    value: registrationFunction(function (name, value) {
      if (values[name] || lazy[name]) {
        throw new TypeError('Cannot overwrite "' + name + '"');
      }
      if (typeof value === 'function') {
        addNames(value);
        lazy[name] = value;
      } else {
        values[name] = Promise.cast(value);
      }
      return self;
    }),

    default: registrationFunction(function (name, value) {
      if (defaults[name]) {
        throw new TypeError('Cannot overwrite default for "' + name + '"');
      }
      if (typeof value === 'function') {
        addNames(value);
      }
      defaults[name] = value;
      return self;
    }),

    nodeValue: registrationFunction(function (name, fn) {
      return self.value(name, promisify(fn));
    }),

    provider: registrationFunction(function (name, fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('Provider for ' + name + ' is not a function');
      }
      addNames(fn);
      providers[name] = fn;
      return self;
    }),

    nodeProvider: registrationFunction(function (name, fn) {
      fn = promisify(fn);
      addNames(fn);
      providers[name] = fn;
      return self;
    }),

    alias: function (alias, source) {
      return self.value(alias, function () { return self.get(source); });
    },

    // Inspection functions

    has: function (name) {
      name = canonicalize(name);
      return Boolean(self.hasValue(name) || (parent && parent.getProvider(name)));
    },

    hasValue: function (name) {
      name = canonicalize(name);
      return Boolean(
        (values[name] !== void 0) ||
        lazy[name] ||
        (parent && parent.hasValue(name))
      );
    },

    getProvider: function (name) {
      name = canonicalize(name);
      return providers[name] || (parent && parent.getProvider(name));
    },

    missingNames: function () {
      return (parent ? parent.missingNames() : [])
        .concat(Object.keys(allNames))
        .filter(not(self.has));
    }
  };

  return self;
})();

function canonicalize (name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError("Cannot canonicalize " + name);
  }
  return name.toLowerCase().replace(/^create|^get|^load|\W/gi, '');
}

function registrationFunction (wrapped) {
  return function (name, fn) {
    switch (typeof name) {
      case 'function':
        fn = name;
        name = fn.name;
        // intentional fallthrough
      case 'string':
        name = canonicalize(name);
        return wrapped(name, fn);
      case 'object':
        var self;
        var object = name;
        for (name in object) {
          self = wrapped(canonicalize(name), object[name]);
        }
        return self;
    }
    throw new TypeError('"name" should be a string, function, or object');
  };
}

// Special version of bluebird.promisify that copies the function signature
function promisify (fn) {
  var signature = parseSignature(fn).slice();
  signature.pop();
  fn = Promise.promisify(fn);
  parseSignature.clobber(fn, signature);
  return fn;
}

function not (fn) {
  return function (it) {
    return !fn(it);
  };
}
