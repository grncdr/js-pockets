var Promise = require('lie');
var apply = require('lie-apply');
var cast = require('lie-cast');
var pocket = require('./');
var tape = require('blue-tape');

function test (description, body) {
  tape(description, function (t) {
    return body.call(t, t, pocket());
  });
}

test('.get', function (t, p) {
  p.value('a', 1);
  t.strictEqual(p.get('a'), cast(p.get('a')), '.get returns a Promise');
  return join(
    p.get('a').then(t.equal.bind(t, 1)),
    p.get('b')
     .then(t.fail.bind(t, 'Missing dep succeeded'))
     .catch(t.pass.bind(t, 'missing dep returns error Promise'))
  );
});

test('.get(name, callback)', function (t, p) {
  p.value('a', 1);
  return new Promise(function (resolve) {
    p.get('a', function (err, value) {
      t.equal(err, null);
      t.equal(1, value);
      resolve();
    });
  });
});

test('.get(name, callback) with error', function (t, p) {
  return new Promise(function (resolve) {
    p.get('a', function (err) {
      t.ok(err);
      t.equal(1, arguments.length);
      resolve();
    });
  });
});

test('.run', function (t, p) {
  p.value('something', 3);
  return p.run(function (something) {
    t.equal(something, 3);
  });
});

test('.value', function (t, p) {
  t.test('.value type checking', function (t) {
    t.throws(function () { p.value(function () {}); },
             '.value requires a name');
    t.throws(function () { p.value(5); }, '.value is picky');
    t.end();
  });

  t.test('.value takes an object', function (t) {
    return p.pocket().value({
      one: 1,
      two: 2,
      three: function (one, two) { return one + two; }
    }).run(function (one, two, three) {
      t.equal(1, one);
      t.equal(2, two);
      t.equal(3, three);
    });
  });
});

test('.wrap', function (t, p) {
  p.value('theValue', 3);
  p.value('multiplier', 2);
  p.wrap('theValue', function (theValue, multiplier) {
    t.equal(multiplier, 2, 'unwrapped values are resolved');
    t.ok(typeof theValue === 'function', 'wrapped value is a thunk');
    theValue = theValue();
    t.ok(typeof theValue.then === 'function', 'the thunk evaluates to a promise');
    return theValue.then(function (theValue) {
      t.equal(theValue, 3, 'the wrapped value resolves correctly');
      return theValue * multiplier;
    });
  });

  return p.get('theValue').then(t.equal.bind(t, 6));
});

test('.wrap works on lazy values', function (t, p) {
  p.value('theValue', function () { return 8; });
  p.value('multiplier', function () { return 3; });
  p.wrap('theValue', function (theValue, multiplier) {
    t.equal(multiplier, 3);
    t.ok(typeof theValue === 'function', 'wrapped value is a thunk');
    theValue = theValue();
    t.ok(typeof theValue.then === 'function', 'the thunk evaluates to a promise');
    return theValue.then(function (theValue) {
      t.equal(theValue, 8);
      return theValue * multiplier;
    });
  });
  return p.get('theValue').then(t.equal.bind(t, 24));
});

test('.wrap can be stacked', function (t, p) {
  p.value('theValue', function () { return 0; });
  p.wrap('theValue', function (theValue) {
    return theValue().then(function (v) { return v + 1; });
  });
  p.wrap('theValue', function (theValue) {
    return theValue().then(function (v) { return v + 1; });
  });
  return p.get('theValue').then(t.equal.bind(t, 2));
});

test('.wrap validates arguments', function (t, p) {
  p.value('theValue', 3);
  p.value('multiplier', 2);
  t.throws(function () {
    p.wrap('theValue', 'tortilla');
  }, 'wrapper function must be a function');

  t.throws(function () {
    p.wrap('someOtherValue', function () {});
  }, 'wrapper must wrap a known name');

  t.end();
});

test('.nodeValue', function (t, p) {
  p.nodeValue(function getNodeStyle (callback) {
    callback(null, 'Node Style');
  });

  return p.run(function (nodeStyle) {
    t.equals(nodeStyle, 'Node Style');
  });
});

test('.missingNames', function (t, p) {
  p.value(function thing (a, b) { });
  t.deepEquals(['a', 'b'], p.missingNames());

  var child = p.pocket();
  p.value('b', 2);
  t.deepEquals(['a'], child.missingNames());
  t.end();
});

test('value caching', function (t, p) {
  var providerExecutionCount = 0;
  var myThing = {};
  p.value(function getThing () {
    providerExecutionCount++;
    return myThing;
  });

  return apply(assertions, p.get('thing'), p.get('thing'));
  function assertions (a, b) {
    t.equal(a, b);
    t.equal(providerExecutionCount, 1);
  }
});

test('parent/child relationships', function (t, p) {
  t.test('children can get deps from parent', function (t) {
    p.value('four', 4);
    p.value(function getFive () { return 5; });

    var child = p.pocket();
    child.value(function getTwenty (four, five) { return four * five; });
    return child.get('twenty').then(t.equal.bind(t, 20));
  });

  t.test('parent cannot retrieve deps from child', function (t) {
    t.assert(!p.has('twenty'));
    t.end();
  });
});

test('granchildren can get deps from their grandparents', function (t, gp) {
  gp.value('five', function () { return 5 });
  var parent = gp.pocket();
  var child = parent.pocket();
  t.ok(child.has('five'), 'Children "have" deps that grandparents "provide"');
  return child.get('five').then(t.equal.bind(t, 5));
});

test('.alias', function (t, p) {
  return p.pocket()
    .value('src', 99)
    .alias('al', 'src')
    .get('al')
    .then(t.equal.bind(t, 99));
});

test('.default', function (t, p) {
  p.default('number', 1);
  p.default('string', function () { return 'ok'; });
  p.default('replaceMe', 'fail');
  p.value('replaceMe', 'ok');
  return join(
    p.get('number').then(t.equal.bind(t, 1)),
    p.get('string').then(t.equal.bind(t, 'ok')),
    p.get('replaceMe').then(t.equal.bind(t, 'ok'))
  );
});

test('overwrite protection', function (t, p) {
  var p1 = p.pocket();
  p1.value('one', 1);
  t.throws(function () {
    p1.value(function one () {});
  });
  var p2 = p.pocket();
  p2.value(function one () {});
  t.throws(function () {
    p1.value('one', 1);
  });

  var p3 = p.pocket();
  p3.default(function one () {});
  t.throws(function () {
    p3.default('one', 1);
  });
  t.end();
});

test('signature parsing', function (t) {
  var parse = require('./signature');
  t.throws(function () {
    parse('blah');
  }, 'Can only parse functions');
  t.end();
});

function join () {
  var args = Array.prototype.slice.call(arguments);
  return Promise.all(args);
}
