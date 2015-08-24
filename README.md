# pockets

[![build-status](https://travis-ci.org/grncdr/js-pockets.svg?branch=master)](https://travis-ci.org/grncdr/js-pockets)
_Builds don't pass without 100% test coverage_

Can't remember where you left something in your app? Check your pockets.

**Warning**: `pockets` implements magical implicit behaviour by parsing function arguments. Just in case that turns you off.

## Synopsis

Pockets hold named values, which may be computed asynchronously. New pockets are created by calling `pocket()`:

```javascript
var assert = require('assert');
var pocket = require('./');
var p = pocket();
```

You put values into the pocket using `.value`:

```javascript
p.value('config', { db: 'sqlite3://:memory:' });
```

... and get them back out with `.get`:

```javascript
p.get('config').then(function (config) {
  assert.deepEqual(config, { db: 'sqlite3://:memory:' })
});
```

As you might have noticed, `.get` returns a promise. It can also be supplied with a [node-style callback][node-style]:

```javascript
p.get('config', function (err, config) {
  if (err) throw err;
  assert.deepEqual(config, { db: 'sqlite3://:memory:' });
});
```

So far, so boring. To make this a little more interesting, let's set a *lazy* value:

```javascript
p.value('database', function (config) {
  return {url: config.db, query: function () {}};
});

p.get('database').then(function (db) {
  assert.equal(db.url, 'sqlite3://:memory:');
});
```

When we call `p.get('database')`, the pocket will call the function we provided to obtain a value for the name `'database'`. This also shows the first bit of implicit behaviour: because the function requires a parameter named `config`, the pocket will pass the _resolved_ value of `pocket.get('config')` to the function.

## Result Caching

Values created by lazy functions are cached, so the function will only be evaluated once. Consider this example:

```javascript
var apply = require('lie-apply');

var invocationCount = 0;

p.value('sideEffectingValue', function () {
  invocationCount++;
  return {value: invocationCount};
});

function assertions (v1, v2) {
  assert.strictEqual(v1, v2); // These are the exact same object.
  assert.strictEqual(invocationCount, 1);
}

apply(assertions, p.get('sideEffectingValue'), p.get('sideEffectingValue'));
```

If you want to run a function that depends on lazy values _without_ caching its result, use `pocket.run`:

```javascript
p.run(function (config, database) {
  return config.db === database.url;
}).then(assert);
```

You can think of `.run` as being a way to "enter" the pocket and `.then` as the way to bring a value back out with you.

## Minimal Interface

An important property of `pockets` is that *none of the functions we're writing depend on `pockets`*.  They're just a normal functions that accept parameters and return a value or promise ([or take a callback][node-style]). In a larger application these functions would be defined in separate modules that can be tested in isolation without having to use `pockets` at all.

Furthermore, we write very little `.then(...)` or callback boilerplate in our functions, because `pockets` takes care of sequencing the dependencies for us.

## Pockets in pockets (in pockets in pockets)

One can "nest" a new pocket in an existing pocket, and values defined for these "child" pockets can have their dependencies fulfilled by the parent:

```javascript
var parent = pocket();
var child = parent.pocket();

parent.value('one', 1);
child.get('one').then(assert.equal.bind(null, 1));
```

This indirect dependency resolution is one-way, allowing you to create isolated scopes:

```javascript
child.value('two', function (one) { return one + one });

parent.get('two').catch(function (err) {
  assert.equal(err.message, 'No provider for "two"');
});
```

This can be particularly useful for implementing a "unit-of-work" pattern for web servers, where every request can have an isolated `pocket` that extends an application-wide pocket with request-specific data. If that interests you, check out [web-pockets](https://github.com/grncdr/web-pockets).

## Using Node-style callback functions

If you're not a fan of promises, all of the asynchronous parts of `pockets` also support node-style callbacks. For example, you can pass a callback to `.get` or `.run`, and you can register lazy values with node-style callbacks using `.nodeValue`:

```javascript
p.nodeValue('currentUser', function (session, Users, callback) {
  Users.findById(session.userId, callback);
});
```

In the above example the `sessionData` and `userModel` parameters will be resolved by the `pocket` and the error or value passed to the callback will be used to resolve the value for `currentUser`.

## Experimental Magic: Function Names as Value Names

Let's create a new pocket and write our previous example using even more clever implicit behaviour:

```javascript
p = pocket()
  .value('config', { db: 'sqlite3://:memory:' })
  .value(function createDatabase (config) {
    return anyDB.createPool(config.db);
  })
  .value(function loadUserModel (database) {
    return UserModel.initializeTables(database);
  });
```

We've created lazy values for the names `'database'` and `'usermodel'` by using named functions. We could have also called the functions `getDatabase` and `createUserModel`, or even `database` and `UsErMoDeL` because names are [canonicalized][] when adding/retrieving objects to/from a pocket. This feature is considered experimental: and may be removed in a future release if it turns out nobody likes it.

## Canonicalization

Names are *canonicalized* when registering or retrieving objects from a pocket. The canonicalization process consists of the following steps:

 1. The name is lower-cased
 2. The prefixes `get`, `load`, and `create` are removed if present.
 3. Any non-word characters (underscores, dollar-signs, etc.) are also removed.

So these names are all equivalent: `get_user`, `User`, `loadUser`, `CREATE_USER`.

## Acknowledgements

I got the idea for `pockets` from talking to @ehd about different ways of doing "promise-based middleware".

## License

MIT

[node-style]: #using-node-style-callback-functions
[canonicalized]: #canonicalization
