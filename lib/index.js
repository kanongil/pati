'use strict';

const Dispatcher = require('./dispatcher');

module.exports = {
    Dispatcher: Dispatcher.Dispatcher,
    EventDispatcher: Dispatcher.EventDispatcher,
    TimeoutDispatcher: Dispatcher.TimeoutDispatcher
};
