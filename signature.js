// source: 
var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var SIGNATURE = '__signature_' + require('hat')();

module.exports = parseSignature;
function parseSignature (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError("Not a function: " + fn);
  }
  if (!fn[SIGNATURE]) {
    var fnText = fn.toString().replace(STRIP_COMMENTS, '');
    var argDecl = fnText.match(FN_ARGS);
    fn[SIGNATURE] = argDecl[1].split(FN_ARG_SPLIT).map(function(arg){
      return arg.replace(FN_ARG, function(all, underscore, name){
        return name;
      });
    }).filter(Boolean);
  }
  return fn[SIGNATURE];
}

parseSignature.clobber = function (fn, signature) {
  fn[SIGNATURE] = signature;
  return fn;
};
