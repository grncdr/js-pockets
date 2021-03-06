/* globals Promise */
'use strict'
var signature = require('./signature')

var Missing = Object.freeze({__missing__: true})

module.exports = function createPocket () {
  return pocket()
}

module.exports.Missing = Missing

function pocket (parent) {
  // mapping of names to lazy value functions, these functions may return
  // synchronously or return a Promise
  var lazy = {}
  // mapping of names to resolved values, wrapped in Promises.
  var values = {}
  var defaults = {}
  var allNames = {}
  var dependencies = {}

  function addNames (fn) {
    signature.parse(fn).forEach(function (name) {
      allNames[name] = true
    })
  }

  function setDependencies (name, it) {
    name = canonicalize(name)
    if (typeof it === 'function') {
      dependencies[name] = signature.parse(it).map(canonicalize)
    } else {
      dependencies[name] = []
    }
  }

  var self = {
    pocket: function () {
      return pocket(self)
    },

    run: function (fn, callback) {
      var params = signature.parse(fn).map(self.get)
      return nodify(callback, Promise.all(params).then(function (params) {
        return fn.apply(self, params)
      }))
    },

    /**
     * Precedence:
     *
     *  1. local (lazy) value
     *  2. parent (lazy) value
     */
    get: function (name, callback) {
      if (typeof callback === 'number') {
        // special-case handling for names.map(self.get)
        callback = void 0
      }
      name = canonicalize(name)
      if (values[name] !== void 0) {
        return nodify(callback, values[name])
      }

      var it = lazy[name] || defaults[name]
      if (typeof it === 'function') {
        values[name] = nodify(callback, self.run(it))
        return values[name]
      } else if (it !== void 0) {
        // it is a concrete default value
        values[name] = nodify(callback, Promise.resolve(it))
        return values[name]
      }

      if (parent && parent.has(name)) {
        return parent.get(name, callback)
      }

      var error = new Error('No provider for "' + name + '"')
      return nodify(callback, Promise.reject(error))
    },

    value: registrationFunction(function (name, value) {
      if (values[name] || lazy[name]) {
        throw new TypeError('Cannot overwrite "' + name + '"')
      }
      if (typeof value === 'function') {
        addNames(value)
        lazy[name] = value
      } else {
        values[name] = Promise.resolve(value)
      }
      setDependencies(name, value)
      return self
    }),

    wrap: registrationFunction(function (name, fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('Cannot wrap "' + name + '", wrapper is not a function')
      }

      var original = values[name] || lazy[name] || defaults[name]
      if (original === void 0) {
        throw new TypeError('Cannot wrap undefined value "' + name + '"')
      }

      var sig = signature.parse(fn).map(canonicalize)
      var position = sig.indexOf(name)

      function wrapper () {
        var args = Array.prototype.slice.call(arguments)

        if (position >= 0) {
          var thunk
          if (typeof original === 'function') {
            thunk = function () { return self.run(original) }
          } else {
            thunk = function () { return Promise.resolve(original) }
          }
          args.splice(position, 0, thunk)
        }

        return fn.apply(this, args)
      }

      signature.clobber(wrapper, sig.filter(function (name_) {
        return name_ !== name
      }))

      delete values[name]
      lazy[name] = wrapper

      return self
    }),

    default: registrationFunction(function (name, value) {
      if (defaults[name]) {
        throw new TypeError('Cannot overwrite default for "' + name + '"')
      }
      if (typeof value === 'function') {
        addNames(value)
      }
      if (!dependencies[name]) {
        setDependencies(name, value)
      }
      defaults[name] = value
      return self
    }),

    nodeValue: registrationFunction(function (name, fn) {
      return self.value(name, promisify(fn))
    }),

    alias: function (alias, source) {
      return self.value(alias, function () { return self.get(source) })
    },

    // Inspection functions

    has: function (name) {
      name = canonicalize(name)
      return Boolean(
        (name in values) ||
        (name in defaults) ||
        lazy[name] ||
        (parent && parent.has(name))
      )
    },

    missingNames: function () {
      var deps = this.dependencies()
      var missing = []
      for (var name in deps) {
        missing = missing.concat(deps[name].filter(not(self.has)))
      }
      return missing
    },

    dependencies: function () {
      var tree = parent ? parent.dependencies() : {}

      for (var name in dependencies) {
        tree[name] = dependencies[name].slice()
      }

      return tree
    }
  }

  return self
}

function canonicalize (name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('Cannot canonicalize ' + name)
  }
  return name.toLowerCase().replace(/^create|^get|^load|\W/gi, '')
}

function registrationFunction (wrapped) {
  return function (name, fn) {
    switch (typeof name) {
      case 'function':
        fn = name
        name = fn.name
        /* falls through */
      case 'string':
        name = canonicalize(name)
        return wrapped(name, fn)
      case 'object':
        var self
        var object = name
        for (name in object) {
          self = wrapped(canonicalize(name), object[name])
        }
        return self
    }
    throw new TypeError('"name" should be a string, function, or object')
  }
}

function not (fn) {
  return function (it) {
    return !fn(it)
  }
}

function nodify (callback, p) {
  return !callback ? p : p.then(
    function (val) { callback(null, val); return val },
    function (err) { callback(err) }
  )
}

function promisify (fn) {
  var sig = signature.parse(fn).slice()
  sig.pop()
  var promisified = function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      args.push(function (err, result) {
        if (err) reject(err)
        else resolve(result)
      })
      fn.apply(self, args)
    })
  }
  signature.clobber(promisified, sig)
  return promisified
}
