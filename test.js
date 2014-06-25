var Promise = require('bluebird');
var assert = require('assert');
var pockets = require('./');
var tape = require('blue-tape');

function test (description, body) {
  tape(description, function (t) {
    return body.call(t, t, pockets.pocket());
  });
}

test('.get', function (t, p) {
  p.value('a', 1);
  t.ok(Promise.is(p.get('a')), '.get returns a Promise');
  return Promise.join(
    p.get('a').then(t.equal.bind(t, 1)),
    p.get('b')
     .then(t.fail.bind(t, 'Missing dep succeeded'))
     .catch(t.pass.bind(t, 'missing dep returns error Promise'))
  );
});

test('.run', function (t, p) {
  p.value('something', 3);
  return p.run(function (something) {
    t.equal(something, 3);
  });
});

test('.value', function (t, p) {
  t.test('.value type checking', function (t) {
    t.throws(function () { p.value(function () {}); }, '.value requires a name');
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

  p = p.pocket();
  p.value('b', 2);
  t.deepEquals(['a'], p.missingNames());
  t.end();
});

test('value caching', function (t, p) {
  var providerExecutionCount = 0;
  var myThing = {};
  p.value(function getThing () {
    providerExecutionCount++;
    return myThing;
  });

  return Promise.join(p.get('thing'), p.get('thing')).spread(function (a, b) {
    t.equal(a, b);
    t.equal(providerExecutionCount, 1);
  });
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

  t.test('granchildren can get deps from their grandparents', function (t) {
    var parent = p.pocket();
    var child = parent.pocket();
    return child.get('five').then(t.equal.bind(t, 5));
  });

  t.test('.alias', function (t) {
    return p.pocket()
      .value('src', 99)
      .alias('al', 'src')
      .get('al')
      .then(t.equal.bind(t, 99));
  });

  t.test('.provider', function (t) {
    var parent = p.pocket();

    parent.provider(function getProvidedValue (thing) {
      return 'Parent received ' + thing;
    });

    t.ok(!parent.has('thing'),
         'parents do not "have" the names they "provider" for children');

    var child1 = parent.pocket();
    var child2 = parent.pocket();
    child1.value(function thing () { return 'thing from child 1'; });
    child2.value(function thing () { return 'thing from child 2'; });

    return Promise.join(
      child1.get('providedValue'), child2.get('ProvidedValue')
    ).spread(function (value1, value2) {
      t.equal('Parent received thing from child 1', value1);
      t.equal('Parent received thing from child 2', value2);
    });
  });

  t.test('.nodeProvider', function (t) {
    var parent = p.pocket();
    parent.nodeProvider(function getCheese (callback) {
      callback(null, 'cheese');
    });
    var child = parent.pocket();
    return child.get('cheese').then(t.equal.bind(t, 'cheese'));
  });

  t.end();
});

test('.provider takes an object', function (t, p) {
  p.provider({
    'the-first-value': function () {
      return 3;
    },
    'The Second Value': function (theFirstValue) {
      return theFirstValue + 81;
    }
  });
  return p.pocket().get('the second value').then(t.equal.bind(t, 84));
});

test('.provider validates its argument', function (t, p) {
  t.throws(function () {
    p.provider({ x: 1 });
  });
  t.end();
});

test('default values', function (t, p) {
  p.default('number', 1);
  p.default('string', function () { return 'ok'; });
  p.default('replaceMe', 'fail');
  p.value('replaceMe', 'ok');
  return Promise.join(
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

test('signature parsing', function (t, p) {
  var parse = require('./signature');
  t.throws(function () {
    parse('blah');
  }, 'Can only parse functions');
  t.end();
});
