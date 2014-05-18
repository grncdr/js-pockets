var Promise = require('bluebird');
var assert = require('assert');
var p = require('./').pocket();
var test = require('blue-tape');
var provider = require('./provider');

test('p', function (t) {
  var providerExecutionCount = 0;
  var mySomething = {};

  p.lazy(function getSomething () {
    providerExecutionCount++;
    return mySomething;
  });

  t.test('.get', function (t) {
    return Promise.join(
      p.get('something').then(t.equal.bind(t, mySomething)),
      p.get('missing').catch(t.pass.bind(t, 'missing dep returns error Promise'))
    );
  });

  t.test('.run', function (t) {
    return p.run(function (something) {
      t.equal(something, mySomething);
    });
  });

  t.test('instance caching', function (t) {
    t.equal(providerExecutionCount, 1);
    t.end();
  });

  t.throws(function () {
    p.lazy(function () {});
  }, '.lazy requires a name');

  t.test('.lazy accepts decorated functions', function (t) {
    return p.pocket()
      .lazy(provider('x', function () { return 1; }))
      .get('x')
      .then(t.equal.bind(t, 1));
  });

  t.test('.values', function (t) {
    p.values({one: 1, two: 2});
    return p.run(function (one, two) {
      t.equal(1, one);
      t.equal(2, two);
    });
  });

  t.test('.lazy accepts an object', function (t) {
    return p.pocket().lazy({
      three: function (one, two) { return one + two; },
    }).get('three')
      .then(t.equal.bind(t, 3));
  });

  t.test('.lazyNode', function (t) {
    p.lazyNode(function getNodeStyle (callback) {
      callback(null, 'Node Style');
    });

    return p.run(function (nodeStyle) {
      t.equals(nodeStyle, 'Node Style');
    });
  });
});

test('parent/child relationships', function (t) {
  t.test('children can get deps from parent', function (t) {
    p.value('four', 4);
    p.lazy(function getFive () { return 5; });
    var child = p.pocket();
    child.lazy(function getTwenty (four, five) { return four * five; });
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

  t.test('.provider', function () {
    var parent = p.pocket();

    parent.provider(function getProvidedValue (thing) {
      return 'Parent received ' + thing;
    });

    t.ok(!parent.has('thing'),
         'parents do not "have" the names they "provider" for children');

    var child1 = parent.pocket();
    var child2 = parent.pocket();
    child1.lazy(function thing () { return 'thing from child 1'; });
    child2.lazy(function thing () { return 'thing from child 2'; });

    return Promise.join(
      child1.get('providedValue'), child2.get('ProvidedValue')
    ).spread(function (value1, value2) {
      t.equal('Parent received thing from child 1', value1);
      t.equal('Parent received thing from child 2', value2);
    });
  });

  t.end();
});

test('strict mode', function (t) {
  var strictPocket = p.pocket(true);
  t.throws(function () {
    strictPocket.lazy(function x (dependsOnSomethingWeDontHave) {
    });
  }, 'cannot register a function with missing dependencies');

  t.throws(function () {
    strictPocket.get('nonexistant thing');
  }, "getting a dependency that doesn't exist throws");

  strictPocket.provider(function providedValue (thing) {});
  t.pass('Able to register provider with missing dependency');
  t.end();
});

test('overwrite protection', function (t) {
  var p1 = p.pocket();
  p1.value('one', 1);
  t.throws(function () {
    p1.lazy(function one () {});
  });
  var p2 = p.pocket();
  p2.lazy(function one () {});
  t.throws(function () {
    p1.value('one', 1);
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
