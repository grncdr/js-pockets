var Promise = require('bluebird');
var parseSignature = require('./signature');

module.exports = (function pocket (parent, strict) {
  // mapping of names to lazy value functions, these functions may return
  // synchronously or return a Promise
  var lazy = {};
  // mapping of names to resolved values, wrapped in Promises.
  var values = {};
  // map of names to provider functions, these are only available to children of
  // this pocket.
  var providers = {};

  var self = {
    pocket: function (addStrict) {
      return pocket(self, Boolean(strict | addStrict));
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

      if (lazy[name]) {
        values[name] = self.run(lazy[name]).nodeify(callback);
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

      var error = Error('No provider for "' + name + '"');
      if (strict) {
        throw error;
      } else {
        return Promise.reject(error).nodeify(callback);
      }
    },

    values: function (mapping) {
      for (var name in mapping) {
        self.value(name, mapping[name]);
      }
      return self;
    },

    value: function (name, value) {
      name = canonicalize(name);
      if (values[name] || lazy[name]) {
        throw new TypeError('Cannot overwrite "' + name + '"');
      }
      values[name] = Promise.cast(value);
      return self;
    },

    lazy: registrationFunction(function (name, fn) {
      name = canonicalize(name || fn.provides);
      if (values[name] || lazy[name]) {
        throw new TypeError('Cannot overrwrite "' + name + '"');
      }
      if (typeof fn === 'function') {
        var signature = parseSignature(fn);
        if (strict) {
          var missing = findMissingDeps(self, signature);
          if (missing.length) {
            throw new Error(
              "No provider(s) for " +
              missing.map(function (name) { return '"' + name + '"'; }).join(', ')
            );
          }
        }
        lazy[name] = fn;
      }
      return self;
    }),

    lazyNode: registrationFunction(function (name, fn) {
      return self.lazy(name, Promise.promisify(fn));
    }),

    provider: registrationFunction(function (name, fn) {
      if (strict) {
        findMissingDeps(self, parseSignature(fn)).forEach(function (name) {
          console.log('what');
        });
      }
      providers[canonicalize(name)] = fn;
      return self;
    }),

    alias: function (alias, source) {
      self.lazy(alias, function () { return self.get(source); });
      return self;
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
  };

  return self;
})();

function canonicalize (name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError("Cannot canonicalize " + name);
  }
  return name.toLowerCase().replace(/^create|^get|^load|\W/i, '');
}

function registrationFunction (wrapped) {
  return function (name, fn) {
    if (typeof name === 'function') {
      fn = name;
      name = fn.name;
    }
    else if (typeof name === 'object') {
      var self;
      for (var key in name) {
        self = wrapped(key, name[key]);
      }
      return self;
    }
    return wrapped(name, fn);
  };
}

function findMissingDeps (self, signature) {
  return signature.filter(function (dependency) {
    return !self.has(canonicalize(dependency));
  });
}
