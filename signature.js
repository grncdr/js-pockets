var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m
var FN_ARG_SPLIT = /,/
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg
var SIGNATURE = '__signature_' + require('hat')()

exports.parse = parse
function parse (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Not a function: ' + fn)
  }
  if (!fn[SIGNATURE]) {
    fn[SIGNATURE] = _parse(fn)
  }
  return fn[SIGNATURE]
}

exports.clobber = clobber
function clobber (fn, names) {
  fn[SIGNATURE] = names
  return fn
}

exports.copy = copy
function copy (fromFn, toFn) {
  toFn[SIGNATURE] = fromFn[SIGNATURE] || _parse(fromFn)
  return toFn
}

/**
 * This code is adapted from the AngularJS v1 dependency injector
 */
function _parse (fn) {
  var fnText = fn.toString().replace(STRIP_COMMENTS, '')
  var argDecl = fnText.match(FN_ARGS)
  return argDecl[1].split(FN_ARG_SPLIT).map(function (arg) {
    return arg.replace(FN_ARG, function (all, underscore, name) {
      return name
    })
  }).filter(Boolean)
}
