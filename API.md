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

Wrap the named value using `fn`. The wrapper *must* depend on `name`, even if it ignores the value.

Throws `TypeError` if:
 - The wrapper is not a function.
 - The name being wrapped is not defined on this pocket.
 - The wrapper function does not depend on the name it is wrapping. For example: `pocket.wrap('request', function (somethingElse) { ... })` is not allowed.

## pocket.default(name, valueOrFn) -> self

Define a default value for the pocket, this behaves exactly like `pocket.value(name, valueOrFn)` except the value can be overridden later with `pocket.value`. Prefer to use `pocket.wrap` over this, as this may be deprecated in the future.

## pocket.alias(name, otherName) -> self

Alias `name` to `otherName`, this is shorthand for `pocket.value(name, function () { return pocket.get(otherName) })`.

## pocket.has(name) -> boolean

Return `true` if this pocket (or any of it's parents) define `name`. This will *not* evaluate lazy values.

## pocket.missingNames() -> [String]

Return a list of names that are depended on by this pocket, but not defined.

## pocket.pocket() -> pocket

Return a new pocket that is a child of this one. Child pockets can retrieve dependencies from their parent, but this relationship is one-way.
