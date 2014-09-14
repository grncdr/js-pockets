# Pockets API

## module.exports = function pocket ()

Create a new empty pocket.

## pocket.get(name) -> Promise

Get a named value from the pocket. Returns a Promise for an eventual value.

## pocket.value(name, valueOrFn) -> self

Define a named value for the pocket. If the second argument is a function, the function will be passed to `self.run` to lazily compute a value on the first usage of `name`. The function may return a promise for a future value.

Throws `TypeError` if the name has already been defined.

## pocket.nodeValue(name, asyncFn) -> self

The same as `pocket.value`, but the lazy value function will have an extra callback argument appended, this callback should be called in the usual node style: `callback(err, value)`.

## pocket.run(fn) -> Promise

Parse the signature of function to determine it's dependencies, retrieve each of those dependencies (using `self.get(name)`) then call `fn(...resolvedDependencies)`. Returns a promise for the final return value of `fn`.

## pocket.wrap(name, wrapperFn) -> self

Wrap the named value using `fn`. The wrapper may depend on `name`, in which case the supplied value for `name` will be a Promise-returning thunk. E.g.

```
pocket.value('blah', function () {
  console.log('evaluating original');
  return 1;
});
pocket.wrap('blah', function (blah) {
  console.log('evaluating wrapper');
  return blah().then(function (value) {
    console.log('evaluated original');
    return value + 1
  });
});
pocket.get('blah').then(console.log);
```

The above will output:

```
evaluating wrapper
evaluating original
evaluated original
2
```

Take care when wrapping names that your return value is compatible with other
users of `name`.

Throws `TypeError` if:
 - The wrapper is not a function.
 - The name being wrapped is not defined on this pocket.


## pocket.alias(name, otherName) -> self

Alias `name` to `otherName`, this is shorthand for `pocket.value(name, function () { return pocket.get(otherName) })`.

## pocket.has(name) -> boolean

Return `true` if this pocket (or any of it's parents) define `name`. This will *not* evaluate lazy values.

## pocket.missingNames() -> [String]

Return a list of names that are depended on by this pocket, but not defined.

## pocket.pocket() -> pocket

Return a new pocket that is a child of this one. Child pockets can retrieve dependencies from their parent, but this relationship is one-way.
