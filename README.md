# pockets

Can't remember where you left something in your app? Check your pockets.

**Warning**: `pockets` uses a lot of implicit magical behaviour. (In particular with regards to parsing function dependencies). Just warning you in case it turns you off.

## Starting out with `pockets`

A `pocket` is created with by calling `pockets.pocket()`:

```javascript
var assert = require('assert');
var pockets = require('./');
var p = pockets.pocket();
```

You can put things into the pocket using `.value`:

```javascript
p.value('config', { db: 'sqlite3://:memory:' });
```

... and get them back out with `.get`:

```javascript
p.get('config').then(function (config) {
  assert.deepEqual(config, { db: 'sqlite3://:memory:' })
}).done();
```

As you might have noticed, `.get` returns a [promise][bluebird]. It can also be supplied with a [node-style callback][node-style]:

```javascript
p.get('config', function (err, config) {
  if (err) throw err;
  assert.deepEqual(config, { db: 'sqlite3://:memory:' });
});
```

So far, so boring. To make this a little more interesting, let's set a *lazy* value by passing a function:

```javascript
p.value('database', function (config) {
  return {query: function () {}};
});
```

This also shows the first bit of implicit behaviour: when we call `p.get('database')`, the pocket will see that the function requires a parameter named `config`, and passes the resolved value of `pocket.get('config')`.

Internally, `pockets` treats all values as lazy, so we can just as easily have lazy values that depend on other lazy values:

```javascript
p.value('userModel', function (database) {
  // database will be the result of our other lazy value function

  return UserModel.initializeTables(database); // returning a Promise
});
```

Notice how none of the functions we're writing have to know anything about `pockets`.  They're just a normal functions that accept parameters and return a value or promise ([or take a callback][node-style]). In a real application, these functions could be defined in separate modules that can be tested in isolation without having to use `pockets` at all.

Furthermore, we never have to write any `.then(...)` or callbacks in our functions, because `pockets` takes care of all the Promises/callback boilerplate for us.

## Getting a result immediately

If you don't want to store the result of a computation, but instead just
evaluate a function with resolved dependencies immediately, use `pocket.run`:

```javascript
p.run(function (config, database) {
  // again, we can return a promise here:
  return config.db;
})
```

## A bit more magic

Let's create a new pocket and write our previous example using even more clever implicit behaviour:

```javascript
p = pockets.pocket()
  .value('config', { db: 'sqlite3://:memory:' })
  .value(function createDatabase (config) {
    return anyDB.createPool(config.db);
  })
  .value(function loadUserModel (database) {
    return UserModel.initializeTables(database);
  });
```

We've created lazy values for the names `'database'` and `'usermodel'` by using named functions. We could have also called the functions `getDatabase` and `createUserModel`, or even `database` and `UsErMoDeL` because names are [canonicalized][] when adding/retrieving objects to/from a pocket.

[bluebird]: https://github.com/petkaantanov/bluebird/blob/master/API.md
[node-style]: #using-node-style-callback-functions
[canonicalized]: #canonicalization

## Caching of created objects

Values created by lazy functions are cached, so the function will only be evaluated once. Consider this example:

```javascript
var invocationCount = 0;
p.value(function getSomethingThatCausesSideEffects () {
  invocationCount++;
  return {value: invocationCount};
});

var Promise = require('bluebird');
Promise.join(
  p.get('somethingThatCausesSideEffects'),
  p.get('somethingThatCausesSideEffects')
).spread(function (v1, v2) {
  assert.strictEqual(v1, v2);
  assert.strictEqual(invocationCount, 1);
}).done();
```

While many DI containers support "factories" that return a new value every time, `pockets` does not, opting instead for nested containers as explained in the next section.

## Pockets in pockets (in pockets in pockets)

One can create a new pocket from an existing pocket, and values defined for these "child" pockets can have their dependencies fulfilled the parent:

```javascript
var child = p.pocket();

p.value('one', 1);
child.get('one').then(assert.equal.bind(null, 1)).done();
```

This indirect dependency resolution is one-way, allowing you to create isolated scopes of dependency resolution:

```javascript
child.value(function two (one) { return one + one });
p.get('two').catch(function (err) {
  assert.equal(err.message, 'No provider for "two"');
});
```

This can be particularly useful for implementing a "unit-of-work" pattern for web servers, where every request can have an isolated `pocket` for request-specific data.

## Advanced usage: `.provider`

When a child triggers the creation of a lazy value on one of it's parents, the result value is cached by the parent. While this is what you want 99% of the time, it does lead to problems when you want to have many isolated pockets that depend on a single parent. Consider the following toy "web framework":

```javascript

function createRequestHandler (appPocket) {
  return function (request, response) {
    var rp = appPocket.pocket();
    rp.value('request', request);
    rp.run(function (result) {
      response.end(JSON.stringify(result));
    });
    rp.done();
  };
}
```

To use it, we create a pocket for the application the pass it to `createRequestHandler`:

```javascript
var app = pockets.pocket();
app.value(function getDatabase () { /* ... */ });
app.value(function getResult (request, database) {
  // pretend this is actually doing something interesting with a database
  return require('url').parse(request.url, true);
});

var server = require('http').createServer(createRequestHandler(app));
```

We want to register the majority of our dependencies on `app`, and then trigger the `getResult` application logic for each `request`/`response` in a child pocket. Unfortunately, the naive implemetation above will return the same result for every request, because the lazy `'result'` value is being cached by `app` after the first request.

Pockets is quite dedicated to maintaining the invariant that `pocket.get(name)` is idempotent and will always return the same value. So to get around this issue it has the concept of "providers". These are lazy value functions that can only be called by child pockets:

```javascript
app.provider(function getResult (request) {
  return require('url').parse(request.url, true);
});
var handler = createRequestHandler(app);
```

`pocket.provider` behaves almost exactly like `pocket.value`, but extends the "only-once" behaviour of `.value` to "only-once-per-child". If a pocket *provides* a name, it does not *have* that name. Instead, it's children have it and the lazily computed value is cached by the specific child that the name was retrieved from. If your app will create child pockets in response to a repeated event (e.g. `'request'`) you can use providers to share behaviour across multiple repetitions of that event.

## Using Node-style callback functions

If you're not a fan of promises, all of the asynchronous parts of `pockets` also support node-style callbacks. For example, you can pass a callback to `.get` or `.run`, and you can register lazy values with node-style callbacks using `.nodeValue`:

```javascript
p.nodeValue(function getCurrentUser (sessionData, userModel, callback) {
  userModel.findById(sessionData.userId, callback);
});
```

In the above example the `sessionData` and `userModel` parameters will be resolved by the `pocket` and error or value provided to the callback will be used to resolve the value for `currentUser`.

## Canonicalization

Names are *canonicalized* when registering or retrieving objects from a pocket. The canonicalization process consists of the following steps:

 1. The name is lower-cased
 2. The prefixes `get`, `load`, and `create` are removed if present.
 3. Any non-word characters (underscores, dollar-signs, etc.) are also removed.

## Acknowledgements

I got the idea for `pockets` from talking to @ehd about different ways of doing "promise-based middleware".

## License

MIT
