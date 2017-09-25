# pati

Async / await helpers

[![Build Status](https://secure.travis-ci.org/kanongil/pati.svg?branch=master)](http://travis-ci.org/kanongil/pati)

Lead Maintainer: [Gil Pedersen](https://github.com/kanongil)

* `EventDispatcher` - Safely consume emitted events.
* `TimeoutDispatcher` - Create a cancelable timeout.

These are both based on a cancellable `Dispatcher` class, that can be used to create custom dispatchers, along with methods to compose them.
